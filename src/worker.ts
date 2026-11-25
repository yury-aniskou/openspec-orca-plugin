// The plugin's worker: reads openspec/ for the focused workspace and launches OpenSpec agents.
import type { OrcaWorkerApi } from 'orca/worker'
import {
  changeFiles,
  changesTouching,
  hasOpenSpec,
  readArchived,
  readChanges,
  readSpecs,
  resolveInside,
  specPath,
  worktreeName
} from './openspec'
import type { OpenSpecState, OpsxStep } from './protocol'
import {
  buildAgentCommand,
  CLI_LIST,
  filterModels,
  modelsFor,
  parseCliModels,
  type ModelItem,
  parseStageChoices,
  parseStringMap,
  slimCatalog,
  SUGGESTED_MODELS,
  validateModel,
  type Catalog
} from './agent'
import { watchFolder, type FolderWatch } from './watch'
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The live watcher on the focused workspace's openspec/ folder, if any. */
let current: FolderWatch | null = null

/** Timings; tests shorten them. */
export const options = {
  watchDelayMs: 300,
  readyPollMs: 500,
  steadyPolls: 6,
  readyTimeoutMs: 120_000
}

/** The models.dev catalog: URL, cache lifetime and request timeout; tests change them. */
export const catalogOptions = {
  url: 'https://models.dev/api.json',
  ttlMs: 24 * 60 * 60 * 1000,
  retryMs: 60_000,
  timeoutMs: 10_000
}

export type CatalogStatus = 'ready' | 'fallback'

let catalog: Catalog | null = null
let catalogAt = 0
let catalogFailedAt = 0
let catalogLoading: Promise<void> | null = null

async function fetchCatalog(orca: OrcaWorkerApi): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), catalogOptions.timeoutMs)
  try {
    const res = await fetch(catalogOptions.url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const next = slimCatalog(await res.json())
    if (!Object.keys(next).length) throw new Error('empty catalog')
    catalog = next
    catalogAt = Date.now()
    catalogFailedAt = 0
    try {
      await orca.storage.set('modelCatalog', { at: catalogAt, data: next })
    } catch {
      // too large or unavailable: keep it in memory only
    }
  } catch {
    catalogFailedAt = Date.now()
  } finally {
    clearTimeout(timer)
  }
}

/** Loads the catalog from memory, storage or the network. A stale catalog is served while it refreshes in the background. */
export async function ensureCatalog(orca: OrcaWorkerApi, force = false): Promise<CatalogStatus> {
  if (!catalog) {
    const saved = (await orca.storage.get('modelCatalog')) as { at?: unknown; data?: unknown } | null
    if (saved && typeof saved.at === 'number' && saved.data && typeof saved.data === 'object') {
      catalog = saved.data as Catalog
      catalogAt = saved.at
    }
  }
  const now = Date.now()
  const stale = !catalog || now - catalogAt > catalogOptions.ttlMs
  const canRetry = !catalogFailedAt || now - catalogFailedAt > catalogOptions.retryMs
  if ((force || (stale && canRetry)) && !catalogLoading) {
    catalogLoading = fetchCatalog(orca).finally(() => {
      catalogLoading = null
    })
  }
  if (catalogLoading && (force || !catalog)) await catalogLoading
  return catalog ? 'ready' : 'fallback'
}

const cliModels = new Map<string, { at: number; items: ModelItem[] }>()

/** Runs the agent CLI's own model listing (no shell, short timeout); an old list is kept when it fails. */
export const cliRunner = {
  run: (file: string, args: string[]): Promise<string> =>
    new Promise((resolve, reject) =>
      execFile(file, args, { timeout: 15_000, maxBuffer: 4_000_000 }, (err, out) => (err ? reject(err) : resolve(String(out))))
    )
}

export async function ensureCliModels(orca: OrcaWorkerApi, agent: string, force = false): Promise<ModelItem[]> {
  const spec = CLI_LIST[agent]
  if (!spec) return []
  let entry = cliModels.get(agent)
  if (!entry) {
    const saved = (await orca.storage.get('cliModels')) as Record<string, { at?: unknown; items?: unknown }> | null
    const row = saved?.[agent]
    if (row && typeof row.at === 'number' && Array.isArray(row.items)) {
      entry = { at: row.at, items: row.items as ModelItem[] }
      cliModels.set(agent, entry)
    }
  }
  if (!force && entry && Date.now() - entry.at < catalogOptions.ttlMs) return entry.items
  try {
    const items = parseCliModels(await cliRunner.run(spec[0], spec[1]))
    if (items.length) {
      entry = { at: Date.now(), items }
      cliModels.set(agent, entry)
      const all = Object.fromEntries([...cliModels].map(([k, v]) => [k, v]))
      try {
        await orca.storage.set('cliModels', all)
      } catch {
        // keep in memory only
      }
    }
  } catch {
    // CLI missing or failing: use what we have
  }
  return entry?.items ?? []
}

/** Test hook: forget the in-memory catalog. */
export function resetCatalog(): void {
  catalog = null
  catalogAt = 0
  catalogFailedAt = 0
  catalogLoading = null
  cliModels.clear()
}

/** Agent kinds the New change form offers. */
export const AGENTS = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'copilot']

const INPUT_MARKER = /^\s*[│|]?\s*[❯>›→➜]/

/** True when the agent's screen shows an input prompt in its last lines. */
export function isAgentReady(lines: readonly string[]): boolean {
  return lines.slice(-15).some((line) => INPUT_MARKER.test(line))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function stopWatching(): void {
  current?.close()
  current = null
}

export function deactivate(): void {
  stopWatching()
}

const SELECTED = 'selectedChange'

const invalid = (message: string) => Object.assign(new Error(message), { code: 'invalid_params' })

type Focus = { workspaceId: string; path: string; hostId: string | null; name: string; projectId: string | null }

async function focused(orca: OrcaWorkerApi): Promise<Focus | null> {
  const ctx = await orca.host.call('workspace.readContext')
  if (!ctx?.workspaceId) return null
  const { workspaces } = await orca.host.call('workspace.list')
  const row = workspaces.find((w) => w.id === ctx.workspaceId)
  if (!row) return null
  return { workspaceId: row.id, path: row.path, hostId: row.hostId, name: ctx.displayName, projectId: row.projectId ?? null }
}

const isLocal = (ws: Focus): boolean => !ws.hostId || ws.hostId === 'local'

export const BOARD_FILE = 'board.openspec'

/** Creates openspec/board.openspec once (never overwrites) and lists it in openspec/.gitignore once. */
export function ensureBoardFile(root: string): void {
  const dir = join(root, 'openspec')
  mkdirSync(dir, { recursive: true })
  const board = join(dir, BOARD_FILE)
  if (!existsSync(board)) writeFileSync(board, '', { flag: 'wx' })
  const ignore = join(dir, '.gitignore')
  const text = existsSync(ignore) ? readFileSync(ignore, 'utf8') : ''
  if (text.split(/\r?\n/).some((l) => l.trim() === BOARD_FILE)) return
  appendFileSync(ignore, `${text && !text.endsWith('\n') ? '\n' : ''}${BOARD_FILE}\n`)
}

/** The focused local workspace's folder; throws when the board data cannot be read. */
async function localRoot(orca: OrcaWorkerApi): Promise<string> {
  const ws = await focused(orca)
  if (!ws) throw invalid('No workspace is focused.')
  if (!isLocal(ws)) throw invalid('Remote workspaces are not supported yet.')
  if (!hasOpenSpec(ws.path)) throw invalid('OpenSpec is not set up in this workspace.')
  return ws.path
}

export async function readState(orca: OrcaWorkerApi): Promise<OpenSpecState> {
  const empty = { changes: [], specs: [] }
  let workspace: string | undefined
  try {
    const ws = await focused(orca)
    if (!ws) return { status: 'no-workspace', ...empty }
    workspace = ws.name
    if (!isLocal(ws)) return { status: 'remote', workspace, ...empty }
    if (!hasOpenSpec(ws.path)) return { status: 'no-openspec', workspace, ...empty }
    return { status: 'ok', workspace, changes: readChanges(ws.path), specs: readSpecs(ws.path) }
  } catch (err) {
    return { status: 'error', workspace, ...empty, error: err instanceof Error ? err.message : String(err) }
  }
}

export type CommandStyle = 'skill' | 'opsx'

/** OpenSpec skill command names, as `openspec init` installs them. */
const SKILLS: Record<OpsxStep, string> = {
  explore: 'openspec-explore',
  propose: 'openspec-propose',
  apply: 'openspec-apply-change',
  verify: 'openspec-verify-change',
  archive: 'openspec-archive-change'
}

export function commandStyleOf(value: unknown): CommandStyle {
  return value === 'opsx' ? 'opsx' : 'skill'
}

/** `arg` is the change name, or the description for explore/propose. Newlines become spaces
 *  so the whole prompt is sent as one line. */
export function promptFor(step: OpsxStep, arg: string | undefined, style: CommandStyle): string {
  const command = style === 'opsx' ? `/opsx:${step}` : `/${SKILLS[step]}`
  const text = arg?.replace(/\s*\r?\n\s*/g, ' ').trim()
  return text ? `${command} ${text}` : command
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The agent and model for a launch: the request, then the choice saved by the panel/board, then settings. */
export async function launchChoice(
  orca: OrcaWorkerApi,
  agentKind?: string,
  modelText?: string
): Promise<{ agent: string; model: string }> {
  const agent = text(agentKind) || text(await orca.storage.get('launchAgent')) || (await defaultAgent(orca))
  const model = modelText !== undefined ? text(modelText) : text(await orca.storage.get('launchModel'))
  return { agent, model: model || text(await orca.settings.get('model')) }
}

/** The agent and model a stage starts with: saved stage default, then the stageDefaults setting, then the global choice. */
export async function stageChoice(
  orca: OrcaWorkerApi,
  step: OpsxStep
): Promise<{ agent: string; model: string; ask: boolean }> {
  const fromSetting = parseStageChoices(await orca.settings.get('stageDefaults'))[step]
  const fromStorage = parseStageChoices(await orca.storage.get('stageChoices'))[step]
  const entry = { ...fromSetting, ...fromStorage }
  const base = await launchChoice(orca)
  return { agent: entry.agent || base.agent, model: entry.model ?? base.model, ask: entry.ask !== false }
}

async function agentCommand(orca: OrcaWorkerApi, agent: string, model: string): Promise<string | undefined> {
  const flags = parseStringMap(await orca.settings.get('modelFlags'))
  const extra = parseStringMap(await orca.settings.get('extraArgs'))
  if (!model && !extra[agent]) return undefined
  return buildAgentCommand(agent, model, flags, extra)
}

async function defaultAgent(orca: OrcaWorkerApi): Promise<string> {
  const setting = await orca.settings.get('agent')
  return typeof setting === 'string' && setting ? setting : 'claude'
}

/** Polls the terminal until it shows an input prompt on a stable screen; false on timeout. */
async function waitReady(orca: OrcaWorkerApi, terminalId: string): Promise<boolean> {
  let previous = ''
  let steady = 0
  const deadline = Date.now() + options.readyTimeoutMs
  while (Date.now() < deadline) {
    await sleep(options.readyPollMs)
    try {
      const { lines } = await orca.host.call('terminal.read', { terminalId, maxLines: 60 })
      const screen = lines.join('\n')
      const same = screen === previous
      steady = same ? steady + 1 : 0
      if (same && isAgentReady(lines)) return true
      // Unknown prompt style: an unchanged, non-empty screen for several polls means the agent is idle.
      if (steady >= options.steadyPolls && screen.trim()) return true
      previous = screen
    } catch {
      // The terminal may not be readable for a moment after launch; keep polling.
    }
  }
  return false
}

/** Starts an agent, shows its terminal, waits until it accepts input, then types the prompt.
 *  Never passes `prompt` to agent.launch: that starts an orphaned background terminal. */
const deliveries = new Set<Promise<void>>()

function track(p: Promise<void>): void {
  deliveries.add(p)
  void p.finally(() => deliveries.delete(p))
}

/** Resolves when every command still waiting to be typed has been sent or given up; for tests. */
export const whenDelivered = async (): Promise<void> => {
  while (deliveries.size) await Promise.all([...deliveries])
}

/** Waits for the agent's input prompt, then types the OpenSpec command; on a timeout nothing is typed and the user is told. */
async function deliver(orca: OrcaWorkerApi, terminalId: string, agent: string, prompt: string): Promise<void> {
  try {
    if (!(await waitReady(orca, terminalId))) {
      const body = `${agent} did not become ready within ${Math.round(options.readyTimeoutMs / 1000)} s; the command was not sent. Type ${prompt} yourself.`
      orca.log(`openspec: ${body}`)
      await orca.host.call('notifications.show', { title: 'OpenSpec', body })
      return
    }
    await orca.host.call('terminal.sendText', { terminalId, text: prompt, enter: true })
  } catch (err) {
    orca.log(`openspec: could not send the command: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function launchVisible(
  orca: OrcaWorkerApi,
  workspaceId: string,
  agent: string,
  prompt: string,
  command?: string
): Promise<string> {
  const { terminalId } = command
    ? await orca.host.call('terminal.create', { workspaceId, title: agent, command })
    : await orca.host.call('agent.launch', { workspaceId, agent })
  try {
    await orca.host.call('terminal.focus', { terminalId })
  } catch (err) {
    orca.log(`openspec: could not show terminal: ${err instanceof Error ? err.message : String(err)}`)
  }
  // Waiting for a slow agent must not hold the request open (Orca times requests out at 30 s).
  track(deliver(orca, terminalId, agent, prompt))
  return terminalId
}

export default function activate(orca: OrcaWorkerApi): void {
  /** Terminals of agents this plugin launched; their `done` triggers a refresh. */
  const launched = new Set<string>()

  const post = async (): Promise<OpenSpecState> => {
    const state = await readState(orca)
    orca.panels.post('openspec.changed', state)
    return state
  }

  /** Watch the focused local workspace's openspec/ folder; no-op when it is already watched. */
  const retarget = async (): Promise<void> => {
    let target: string | null = null
    try {
      const ws = await focused(orca)
      if (ws && isLocal(ws) && hasOpenSpec(ws.path)) target = join(ws.path, 'openspec')
    } catch {
      target = null
    }
    if (current?.path === target) return
    stopWatching()
    if (!target) return
    try {
      current = watchFolder(
        target,
        () => void post(),
        (err) => {
          current = null
          orca.log(`openspec watch stopped: ${err.message}`)
        },
        options.watchDelayMs
      )
    } catch (err) {
      orca.log(`openspec watch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const refresh = async (): Promise<OpenSpecState> => {
    await retarget()
    return post()
  }

  const launch = async (
    step: OpsxStep,
    arg?: string,
    agentKind?: string,
    modelText?: string
  ): Promise<{ terminalId: string }> => {
    const ws = await focused(orca)
    if (!ws) throw invalid('No workspace is focused.')
    if (!isLocal(ws)) throw invalid('Remote workspaces are not supported yet.')
    const { agent, model } = await launchChoice(orca, agentKind, modelText)
    let command: string | undefined
    try {
      command = await agentCommand(orca, agent, model)
    } catch (err) {
      throw invalid(err instanceof Error ? err.message : String(err))
    }
    const style = commandStyleOf(await orca.settings.get('commandStyle'))
    let workspaceId = ws.workspaceId
    if (step === 'propose') {
      if (!ws.projectId) throw invalid('Propose needs a workspace in a Git project to create a worktree.')
      try {
        ;({ workspaceId } = await orca.host.call('workspace.create', {
          projectId: ws.projectId,
          name: worktreeName(arg ?? ''),
          open: true
        }))
      } catch (err) {
        throw invalid(`Could not create a worktree: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const terminalId = await launchVisible(orca, workspaceId, agent, promptFor(step, arg, style), command)
    launched.add(terminalId)
    return { terminalId }
  }

  orca.panels.handle('openspec.refresh', refresh)
  orca.panels.handle('openspec.state', async () => {
    await retarget()
    return readState(orca)
  })
  orca.panels.handle('openspec.launch', ({ step, change, description, agent, model }) =>
    launch(step, change ?? description, agent, model)
  )
  orca.panels.handle('openspec.stageChoice', async ({ step }) => {
    try {
      return await stageChoice(orca, step)
    } catch (err) {
      throw invalid(err instanceof Error ? err.message : String(err))
    }
  })
  orca.panels.handle('openspec.saveStageChoice', async ({ step, agent, model, ask }) => {
    try {
      validateModel(model.trim())
    } catch (err) {
      throw invalid(err instanceof Error ? err.message : String(err))
    }
    const saved = parseStageChoices(await orca.storage.get('stageChoices'))
    await orca.storage.set('stageChoices', {
      ...saved,
      [step]: { agent: agent.trim(), model: model.trim(), ask: ask ?? saved[step]?.ask ?? true }
    })
    return { saved: true }
  })
  orca.panels.handle('openspec.models', async ({ agent, query, limit }) => {
    const catalogStatus = await ensureCatalog(orca)
    const cli = await ensureCliModels(orca, agent)
    const found = filterModels(modelsFor(agent, catalog, cli), query ?? '')
    return { items: found.slice(0, Math.max(1, Math.min(limit ?? 50, 200))), total: found.length, catalog: catalogStatus }
  })
  orca.panels.handle('openspec.refreshModels', async () => {
    const status = await ensureCatalog(orca, true)
    await Promise.all(Object.keys(CLI_LIST).map((agent) => ensureCliModels(orca, agent, true)))
    return { catalog: status }
  })
  orca.panels.handle('openspec.agents', async () => {
    const preferred = await defaultAgent(orca)
    return {
      agents: [preferred, ...AGENTS.filter((a) => a !== preferred)],
      defaultAgent: preferred,
      models: SUGGESTED_MODELS
    }
  })
  orca.panels.handle('openspec.init', async () => {
    const ws = await focused(orca)
    if (!ws) throw invalid('No workspace is focused.')
    if (!isLocal(ws)) throw invalid('Remote workspaces are not supported yet.')
    const { terminalId } = await orca.host.call('terminal.create', {
      workspaceId: ws.workspaceId,
      title: 'openspec init',
      command: 'openspec init'
    })
    return { terminalId }
  })

  orca.events.on('workspace.changed', () => void refresh())
  orca.events.on('agent.status.changed', (e) => {
    if (e.state === 'done' && e.terminalId && launched.has(e.terminalId)) void refresh()
  })

  const openInEditor = async (ws: Focus, rel: string): Promise<void> => {
    try {
      await orca.host.call('editor.open', { workspaceId: ws.workspaceId, path: rel })
    } catch {
      await orca.host.call('editor.open', { workspaceId: ws.workspaceId, path: join(ws.path, rel) })
    }
  }

  const noTarget = { spec: null, change: null, archived: false }
  let boardTarget: { spec: string | null; change: string | null; archived: boolean } = noTarget

  const openBoard = async (input?: { spec?: string; change?: string; archived?: boolean }): Promise<{ opened: boolean; message?: string }> => {
    const ws = await focused(orca)
    if (!ws) return { opened: false, message: 'No workspace is focused.' }
    if (!isLocal(ws)) return { opened: false, message: 'Remote workspaces are not supported yet.' }
    if (!hasOpenSpec(ws.path)) return { opened: false, message: 'Set up OpenSpec in this workspace first.' }
    ensureBoardFile(ws.path)
    if (input?.spec) {
      boardTarget = { spec: input.spec, change: null, archived: false }
      orca.panels.post('openspec.showSpec', { spec: input.spec })
    } else if (input?.change) {
      boardTarget = { spec: null, change: input.change, archived: input.archived === true }
      orca.panels.post('openspec.showChange', { change: input.change, archived: input.archived === true })
    }
    await openInEditor(ws, `openspec/${BOARD_FILE}`)
    return { opened: true }
  }

  orca.panels.handle('openspec.openBoard', () => openBoard())
  orca.panels.handle('openspec.openChangeOnBoard', ({ change }) => openBoard({ change }))
  orca.panels.handle('openspec.openSpecOnBoard', async ({ spec }) => {
    const touching = changesTouching(await localRoot(orca), [spec])
    // Prefer the change page (docs, deltas); newest first, active before archived.
    const latest = touching.filter((c) => !c.archived).at(-1) ?? touching.at(-1)
    return openBoard(latest ? { change: latest.name, archived: latest.archived } : { spec })
  })
  orca.panels.handle('openspec.takeBoardTarget', () => {
    const target = boardTarget
    boardTarget = noTarget
    return target
  })
  orca.panels.handle('openspec.promptFor', async ({ step, change }) => ({
    prompt: promptFor(step, change, commandStyleOf(await orca.settings.get('commandStyle')))
  }))
  orca.panels.handle('openspec.archived', async ({ offset, limit, filter }) =>
    readArchived(await localRoot(orca), Math.max(0, offset), Math.min(Math.max(1, limit), 200), filter)
  )
  orca.panels.handle('openspec.changeFiles', async ({ change, archived }) => {
    const root = await localRoot(orca)
    const { files, specs } = changeFiles(root, change, !!archived)
    return { files, specs, related: changesTouching(root, specs, { name: change, archived: !!archived }) }
  })
  orca.panels.handle('openspec.specInfo', async ({ spec }) => {
    const root = await localRoot(orca)
    return { path: specPath(root, spec), changedBy: changesTouching(root, [spec]) }
  })
  orca.panels.handle('openspec.readFile', async ({ path }) => ({
    text: readFileSync(resolveInside(await localRoot(orca), path), 'utf8')
  }))
  orca.panels.handle('openspec.openFile', async ({ path }) => {
    const ws = await focused(orca)
    if (!ws) throw invalid('No workspace is focused.')
    const root = await localRoot(orca)
    resolveInside(root, path)
    await openInEditor(ws, `openspec/${path}`)
    return { opened: true }
  })

  const notify = async (body: string): Promise<string> => {
    await orca.host.call('notifications.show', { title: 'OpenSpec', body })
    return body
  }

  orca.commands.register('openspec.propose', async () => {
    orca.panels.post('openspec.showForm', {})
    return notify('Describe the change in the OpenSpec panel, then press Explore or Propose.')
  })
  for (const step of ['apply', 'verify', 'archive'] as const) {
    orca.commands.register(`openspec.${step}`, async () => {
      const state = await readState(orca)
      const selected = await orca.storage.get(SELECTED)
      const names = state.changes.map((c) => c.name)
      const change =
        typeof selected === 'string' && names.includes(selected) ? selected : names.length === 1 ? names[0] : undefined
      if (!change) {
        return notify(
          names.length ? 'Select a change in the OpenSpec panel first.' : 'No active OpenSpec change in this workspace.'
        )
      }
      try {
        await launch(step, change)
      } catch (err) {
        return notify(err instanceof Error ? err.message : String(err))
      }
      return `Started ${step} for ${change}`
    })
  }
  orca.commands.register('openspec.openBoard', async () => {
    const r = await openBoard()
    return r.opened ? 'Opened the OpenSpec board' : notify(r.message ?? 'Could not open the board.')
  })
  orca.commands.register('openspec.refresh', async () => {
    await refresh()
    return 'Refreshed'
  })
}
