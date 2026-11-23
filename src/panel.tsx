// No build step: Orca strips the types and compiles the JSX when the panel loads.
import {
  atom,
  Box,
  Button,
  Callout,
  EmptyState,
  Heading,
  IconButton,
  Input,
  List,
  ListItem,
  plugin,
  Progress,
  read,
  Row,
  Select,
  set,
  Spinner,
  Stack,
  Tab,
  Tabs,
  Text,
  Textarea,
  type PanelContext
} from 'orca'
import type { ChangeInfo, OpenSpecState, OpsxStep } from './protocol'
import { filterByName, isReady, matchesChip, progressText, statusOf, type Chip } from './view'

const state = atom<OpenSpecState | null>(null)
const actionError = atom<string | null>(null)
/** Shared with the worker's palette commands through plugin storage. */
const selected = atom<string | null>('selectedChange', null, { persist: 'storage' })
const tab = atom<string>('tab', 'changes', { persist: 'plugin' })
const changeFilter = atom<string>('changeFilter', '', { persist: 'plugin' })
const specFilter = atom<string>('specFilter', '', { persist: 'plugin' })
const chip = atom<Chip>('chip', 'all', { persist: 'plugin' })
const refreshing = atom(false)

/** The spinner stays at least this long, so a fast refresh is still visible. */
export const MIN_SPIN_MS = 500

const CHIPS: { value: Chip; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In progress' },
  { value: 'done', label: 'Done' }
]

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function receive(next: OpenSpecState): void {
  set(state, next)
}

async function load(): Promise<void> {
  receive(await plugin.request('openspec.state'))
}

async function reload(): Promise<void> {
  if (read(refreshing)) return
  set(refreshing, true)
  set(actionError, null)
  const minimum = new Promise((r) => setTimeout(r, MIN_SPIN_MS))
  try {
    const [next] = await Promise.all([plugin.request('openspec.refresh'), minimum])
    receive(next)
  } catch (err) {
    await minimum
    set(actionError, `Refresh failed: ${message(err)}`)
  } finally {
    set(refreshing, false)
  }
}

async function call(fn: () => Promise<unknown>): Promise<void> {
  set(actionError, null)
  try {
    await fn()
  } catch (err) {
    set(actionError, message(err))
  }
}

/** The chosen agent and model, sent with each launch; empty values fall back to the worker's defaults. */
function choice(): { agent?: string; model?: string } {
  const agent = read(launchAgent)
  const model = read(launchModel).trim()
  return { ...(agent ? { agent } : {}), model }
}

/** A stage action waiting for the user to confirm the agent and model. */
type Pending = { step: OpsxStep; change?: string; description?: string }
const pending = atom<Pending | null>(null)
const dialogAgent = atom('')
const dialogModel = atom('')
const dialogBusy = atom(false)
const dialogError = atom<string | null>(null)
const dialogNote = atom<string | null>(null)

async function ask(target: Pending): Promise<void> {
  set(dialogError, null)
  set(dialogNote, null)
  let found: { agent: string; model: string; ask: boolean } | null = null
  let failure: string | null = null
  try {
    found = await plugin.request('openspec.stageChoice', { step: target.step })
  } catch (err) {
    failure = message(err)
  }
  if (found && found.ask === false) {
    await call(async () => {
      await plugin.request('openspec.launch', { ...target, agent: found.agent, model: found.model.trim() })
      if (target.description) closeForm()
    })
    return
  }
  set(dialogAgent, found?.agent ?? read(launchAgent))
  set(dialogModel, found?.model ?? read(launchModel))
  set(dialogError, failure)
  set(pending, target)
}

function cancelDialog(): void {
  set(pending, null)
  set(dialogError, null)
  set(dialogNote, null)
}

async function confirmDialog(): Promise<void> {
  const target = read(pending)
  if (!target || read(dialogBusy)) return
  set(dialogBusy, true)
  set(dialogError, null)
  try {
    const agent = read(dialogAgent)
    await plugin.request('openspec.launch', { ...target, ...(agent ? { agent } : {}), model: read(dialogModel).trim() })
    if (target.description) closeForm()
    set(pending, null)
  } catch (err) {
    set(dialogError, message(err))
  } finally {
    set(dialogBusy, false)
  }
}

async function saveDialogDefault(askNext?: boolean): Promise<void> {
  const target = read(pending)
  if (!target) return
  set(dialogError, null)
  try {
    await plugin.request('openspec.saveStageChoice', {
      step: target.step,
      agent: read(dialogAgent) || 'claude',
      model: read(dialogModel).trim(),
      ...(askNext === undefined ? {} : { ask: askNext })
    })
    set(
      dialogNote,
      askNext === false
        ? `${target.step} will launch directly with this choice. Change it in the Stages tab.`
        : `Saved as the default for ${target.step}.`
    )
  } catch (err) {
    set(dialogError, message(err))
  }
}

const run = (step: OpsxStep, change: string) => ask({ step, change })
const openBoard = () =>
  call(async () => {
    const r = await plugin.request('openspec.openBoard')
    if (!r.opened && r.message) set(actionError, r.message)
  })
const init = () => call(() => plugin.request('openspec.init'))
const clearFilters = () => {
  set(chip, 'all')
  set(changeFilter, '')
}

/** The New change form: panel-only state; the description is never persisted. */
const formOpen = atom(false)
const description = atom('')
/** The launch choice, shared with the worker's palette commands and the board through plugin storage. */
const launchAgent = atom<string>('launchAgent', '', { persist: 'storage' })
const launchModel = atom<string>('launchModel', '', { persist: 'storage' })
const agentOptions = atom<string[]>([])
const formBusy = atom(false)
const formError = atom<string | null>(null)

async function loadAgents(): Promise<void> {
  try {
    const { agents, defaultAgent } = await plugin.request('openspec.agents')
    set(agentOptions, agents)
    if (!read(launchAgent)) set(launchAgent, defaultAgent)
  } catch {
    set(agentOptions, ['claude'])
    if (!read(launchAgent)) set(launchAgent, 'claude')
  }
}

function openForm(): void {
  set(formError, null)
  set(formOpen, true)
}

function closeForm(): void {
  set(formOpen, false)
  set(description, '')
  set(formError, null)
}

function startFromForm(step: 'explore' | 'propose'): void {
  const text = read(description).trim()
  if (!text) return
  void ask({ step, description: text })
}

type ModelResults = { items: { id: string; name: string }[]; total: number; catalog: 'ready' | 'fallback' }
const modelResults = atom<ModelResults>({ items: [], total: 0, catalog: 'ready' })
const modelBrowse = atom(false)
const catalogBusy = atom(false)
let searchSeq = 0

/** Asks the worker for models matching `query`; an older answer never overwrites a newer one. */
async function searchModels(agent: string, query: string, limit: number): Promise<void> {
  const seq = ++searchSeq
  try {
    const found = await plugin.request('openspec.models', { agent, query, limit })
    if (seq === searchSeq) set(modelResults, found)
  } catch {
    // keep the previous list; typing a model by hand still works
  }
}

function clearModelList(): void {
  searchSeq++
  set(modelBrowse, false)
  set(modelResults, { items: [], total: 0, catalog: read(modelResults).catalog })
}

async function refreshModels(agent: string): Promise<void> {
  if (read(catalogBusy)) return
  set(catalogBusy, true)
  try {
    await plugin.request('openspec.refreshModels')
    if (read(modelBrowse)) await searchModels(agent, '', 50)
    else await searchModels(agent, '', 1)
  } catch (err) {
    set(actionError, `Could not refresh models: ${message(err)}`)
  } finally {
    set(catalogBusy, false)
  }
}

/** Agent select and a searchable model field over a pair of atoms; used for the global choice and the launch dialog. */
function ChoiceFields(props: { agentAtom: typeof launchAgent; modelAtom: typeof launchModel; prefix?: string }) {
  const prefix = props.prefix ? `${props.prefix} ` : ''
  const agents = read(agentOptions)
  const agent = read(props.agentAtom) || agents[0] || 'claude'
  const model = read(props.modelAtom).trim()
  const found = read(modelResults)
  const browsing = read(modelBrowse)
  const exact = found.items.length === 1 && found.items[0].id === model
  const showList = (browsing || model !== '') && found.items.length > 0 && !exact
  return (
    <Box direction="column" gap="xs" padding="sm">
      <Select
        label={`${prefix}Agent`}
        value={agent}
        options={(agents.length ? agents : ['claude']).map((a) => ({ value: a, label: a }))}
        onChange={(v) => {
          set(props.agentAtom, v)
          set(props.modelAtom, '')
          clearModelList()
        }}
      />
      <Input
        label={`${prefix}Model`}
        placeholder="CLI default - type to search"
        value={model}
        onChange={(v) => {
          set(props.modelAtom, v)
          set(modelBrowse, false)
          if (v.trim()) void searchModels(agent, v.trim(), 8)
          else clearModelList()
        }}
      />
      <Row gap="xs">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            if (browsing) return clearModelList()
            set(modelBrowse, true)
            void searchModels(agent, model, 50)
          }}
        >
          {browsing ? 'Hide models' : 'Browse models'}
        </Button>
        <Button size="sm" variant="ghost" disabled={read(catalogBusy)} onPress={() => refreshModels(agent)}>
          Refresh models
        </Button>
      </Row>
      {found.catalog === 'fallback' ? (
        <Text muted size="xs">
          The full model list is not available (offline?). Showing built-in suggestions; any model name can be typed.
        </Text>
      ) : null}
      {showList ? (
        <List label="Models">
          {found.items.map((m) => (
            <ListItem
              key={m.id}
              title={m.id}
              description={m.name === m.id ? undefined : m.name}
              onPress={() => {
                set(props.modelAtom, m.id)
                clearModelList()
              }}
            />
          ))}
        </List>
      ) : null}
      {model !== '' && found.items.length === 0 && found.catalog === 'ready' && !browsing ? (
        <Text muted size="xs">
          No listed model matches. "{model}" will be used as typed.
        </Text>
      ) : null}
      {showList && found.total > found.items.length ? (
        <Text muted size="xs">
          {found.total - found.items.length} more - keep typing to narrow the list.
        </Text>
      ) : null}
    </Box>
  )
}

function LaunchPicker() {
  return <ChoiceFields agentAtom={launchAgent} modelAtom={launchModel} />
}

function LaunchDialog() {
  const target = read(pending)
  if (!target) return null
  const busy = read(dialogBusy)
  const err = read(dialogError)
  const note = read(dialogNote)
  return (
    <Box direction="column" gap="xs" padding="sm">
      <Heading level={3}>
        {target.step}
        {target.change ? `: ${target.change}` : ''}
      </Heading>
      <ChoiceFields agentAtom={dialogAgent} modelAtom={dialogModel} />
      {err ? <Callout tone="danger">{err}</Callout> : null}
      {note ? <Text muted size="xs">{note}</Text> : null}
      <Row gap="xs">
        <Button variant="solid" tone="accent" icon="play" disabled={busy} onPress={confirmDialog}>
          Launch
        </Button>
        <Button variant="outline" disabled={busy} onPress={() => saveDialogDefault()}>
          Save as default
        </Button>
        <Button variant="outline" disabled={busy} onPress={() => saveDialogDefault(false)}>
          Don't ask again
        </Button>
        <Button variant="ghost" disabled={busy} onPress={cancelDialog}>
          Cancel
        </Button>
      </Row>
      {busy ? (
        <Text muted size="xs">
          Starting the agent and waiting for it to be ready…
        </Text>
      ) : null}
    </Box>
  )
}

function NewChangeForm() {
  const text = read(description)
  const busy = read(formBusy)
  const empty = text.trim().length === 0
  const err = read(formError)
  return (
    <Box direction="column" gap="sm" padding="sm">
      <Textarea
        label="Describe the change"
        placeholder="What do you want to build or fix?"
        rows={4}
        value={text}
        disabled={busy}
        onChange={(v) => set(description, v)}
      />
      {err ? <Callout tone="danger">{err}</Callout> : null}
      <Row gap="xs">
        <Button variant="solid" tone="accent" icon="search" disabled={empty || busy} onPress={() => startFromForm('explore')}>
          Explore
        </Button>
        <Button variant="outline" disabled={empty || busy} onPress={() => startFromForm('propose')}>
          Propose
        </Button>
        <Button variant="ghost" disabled={busy} onPress={closeForm}>
          Cancel
        </Button>
      </Row>
      {busy ? (
        <Text muted size="xs">
          Starting the agent and waiting for it to be ready…
        </Text>
      ) : null}
    </Box>
  )
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('openspec.changed', (payload) => receive(payload)))
  ctx.subscriptions.push(plugin.on('openspec.showForm', () => void openForm()))
  void load()
  void loadAgents()
  void loadStages()
}

function Header(props: { title: string; canCreate: boolean }) {
  return (
    <Row justify="between">
      <Heading level={3}>{props.title}</Heading>
      <Row gap="xs">
        {props.canCreate ? (
          <IconButton icon="layers" label="Open board" size="sm" variant="ghost" onPress={openBoard} />
        ) : null}
        {props.canCreate ? (
          <IconButton
            icon={read(formOpen) ? 'close' : 'add'}
            label={read(formOpen) ? 'Close new change' : 'New change'}
            size="sm"
            variant="solid"
            tone="accent"
            onPress={() => (read(formOpen) ? closeForm() : openForm())}
          />
        ) : null}
        {read(refreshing) ? (
          <Spinner label="Refreshing" labelHidden />
        ) : (
          <IconButton icon="refresh" label="Refresh" size="sm" variant="ghost" onPress={reload} />
        )}
      </Row>
    </Row>
  )
}

function ChangesTab(props: { changes: ChangeInfo[] }) {
  const text = read(changeFilter)
  const active = read(chip)
  const visible = filterByName(props.changes, text, (c) => c.name).filter((c) => matchesChip(c, active))
  const current = visible.find((c) => c.name === read(selected))
  return (
    <Stack gap="sm">
      <Row gap="xs">
        <Input
          label="Filter changes"
          labelHidden
          type="search"
          placeholder="Filter changes"
          value={text}
          onChange={(v) => set(changeFilter, v)}
        />
        <Select label="Status" labelHidden value={active} options={CHIPS} onChange={(v) => set(chip, v as Chip)} />
      </Row>
      {props.changes.length === 0 ? (
        <Text muted>No active changes.</Text>
      ) : visible.length === 0 ? (
        <Row justify="between">
          <Text muted>No matching changes.</Text>
          <Button size="sm" variant="ghost" onPress={clearFilters}>
            Clear filters
          </Button>
        </Row>
      ) : (
        <List label="Changes">
          {visible.map((c) => (
            <ListItem
              key={c.name}
              title={c.name}
              description={`${statusOf(c)} · ${progressText(c)}`}
              current={c.name === current?.name}
              onPress={() => {
                set(selected, c.name)
                void openChange(c.name)
              }}
            >
              {c.total ? <Progress label={`${c.name} progress`} labelHidden value={Math.round((100 * c.done) / c.total)} /> : null}
            </ListItem>
          ))}
        </List>
      )}
      {current ? (
        <Box direction="column" gap="sm" padding="sm">
          <Text>{current.name}</Text>
          <Row gap="xs">
            {isReady(current) ? null : (
              <Button variant="solid" tone="accent" icon="play" onPress={() => run('apply', current.name)}>
                Apply
              </Button>
            )}
            {isReady(current) ? (
              <Button variant="outline" tone="success" icon="check" onPress={() => run('archive', current.name)}>
                Archive
              </Button>
            ) : (
              <Button variant="outline" onPress={() => run('verify', current.name)}>
                Verify
              </Button>
            )}
          </Row>
        </Box>
      ) : visible.length ? (
        <Text muted size="xs">
          Select a change to apply or verify it.
        </Text>
      ) : null}
    </Stack>
  )
}

const STAGES: OpsxStep[] = ['explore', 'propose', 'apply', 'verify', 'archive']
type StageRow = { agent: string; model: string; ask: boolean }
const stageRows = atom<Record<string, StageRow>>({})
const stageNote = atom<string | null>(null)

async function loadStages(): Promise<void> {
  const rows: Record<string, StageRow> = {}
  for (const step of STAGES) {
    try {
      rows[step] = await plugin.request('openspec.stageChoice', { step })
    } catch {
      rows[step] = { agent: read(launchAgent) || 'claude', model: '', ask: true }
    }
  }
  set(stageRows, rows)
  selectStage(read(stageSel))
}

const stageSel = atom<OpsxStep>('explore')
const stageAgent = atom('')
const stageModel = atom('')

function selectStage(step: OpsxStep): void {
  const row = read(stageRows)[step]
  set(stageSel, step)
  set(stageAgent, row?.agent ?? 'claude')
  set(stageModel, row?.model ?? '')
  set(stageNote, null)
  clearModelList()
}

const editAsk = (step: string, ask: boolean): void =>
  set(stageRows, { ...read(stageRows), [step]: { ...read(stageRows)[step], ask } })

async function saveStage(): Promise<void> {
  const step = read(stageSel)
  const row = read(stageRows)[step]
  const next = { agent: read(stageAgent) || 'claude', model: read(stageModel).trim(), ask: row?.ask ?? true }
  set(stageNote, null)
  await call(async () => {
    await plugin.request('openspec.saveStageChoice', { step, ...next })
    set(stageRows, { ...read(stageRows), [step]: next })
    set(stageNote, `Saved ${step}.`)
  })
}

function StagesTab() {
  const rows = read(stageRows)
  const step = read(stageSel)
  const note = read(stageNote)
  if (!Object.keys(rows).length) return <Spinner label="Loading stages" />
  return (
    <Stack gap="sm">
      <Text muted size="xs">
        Pick a stage, set its agent and model once. "Launch directly" skips the dialog.
      </Text>
      <Select
        label="Stage"
        value={step}
        options={STAGES.map((st) => ({ value: st, label: `${st} - ${rows[st].agent}${rows[st].model ? ` / ${rows[st].model}` : ''}${rows[st].ask ? '' : ' (direct)'}` }))}
        onChange={(v) => selectStage(v as OpsxStep)}
      />
      <ChoiceFields agentAtom={stageAgent} modelAtom={stageModel} prefix="Stage" />
      <Select
        label="Launch"
        value={rows[step].ask ? 'ask' : 'direct'}
        options={[
          { value: 'ask', label: 'Ask each time' },
          { value: 'direct', label: 'Launch directly' }
        ]}
        onChange={(v) => editAsk(step, v === 'ask')}
      />
      <Button variant="outline" onPress={saveStage}>
        Save {step}
      </Button>
      {note ? (
        <Text muted size="xs">
          {note}
        </Text>
      ) : null}
    </Stack>
  )
}

async function openChange(name: string): Promise<void> {
  await call(async () => {
    const r = await plugin.request('openspec.openChangeOnBoard', { change: name })
    if (!r.opened) set(actionError, r.message ?? 'Could not open the board.')
  })
}

async function openSpec(name: string): Promise<void> {
  await call(async () => {
    const r = await plugin.request('openspec.openSpecOnBoard', { spec: name })
    if (!r.opened) set(actionError, r.message ?? 'Could not open the board.')
  })
}

function SpecsTab(props: { specs: string[] }) {
  const text = read(specFilter)
  const visible = filterByName(props.specs, text, (s) => s)
  return (
    <Stack gap="sm">
      <Input
        label="Filter specs"
        labelHidden
        type="search"
        placeholder="Filter specs"
        value={text}
        onChange={(v) => set(specFilter, v)}
      />
      {props.specs.length === 0 ? (
        <Text muted>No specs yet.</Text>
      ) : visible.length === 0 ? (
        <Text muted>No matching specs.</Text>
      ) : (
        <List label="Specs">
          {visible.map((name) => (
            <ListItem key={name} title={name} onPress={() => openSpec(name)} />
          ))}
        </List>
      )}
    </Stack>
  )
}

export default function Panel() {
  const s = read(state)
  const err = read(actionError)
  if (!s) return <Spinner label="Loading OpenSpec" />

  const title = s.workspace ?? 'OpenSpec'
  const errorBox = err ? <Callout tone="danger">{err}</Callout> : null

  if (s.status === 'no-workspace')
    return <EmptyState title="No workspace" description="Focus a workspace to see its OpenSpec changes." />
  if (s.status === 'remote')
    return (
      <Stack gap="sm">
        <Header title={title} canCreate={false} />
        <EmptyState title="Remote workspace" description="Remote workspaces are not supported yet." />
      </Stack>
    )
  if (s.status === 'error')
    return (
      <Stack gap="sm">
        <Header title={title} canCreate={false} />
        <Callout tone="danger">Could not read OpenSpec: {s.error}</Callout>
      </Stack>
    )
  if (s.status === 'no-openspec')
    return (
      <Stack gap="sm">
        <Header title={title} canCreate={false} />
        <EmptyState title="OpenSpec is not set up" description="This workspace has no openspec/ folder.">
          <Button onPress={init}>Init OpenSpec</Button>
        </EmptyState>
        {errorBox}
      </Stack>
    )

  return (
    <Stack gap="sm">
      <Header title={title} canCreate />
      {read(pending) ? <LaunchDialog /> : <LaunchPicker />}
      {read(formOpen) ? <NewChangeForm /> : null}
      {errorBox}
      <Tabs label="OpenSpec views" value={read(tab)} onChange={(v) => set(tab, v)}>
        <Tab value="changes" label={`Changes (${s.changes.length})`}>
          <ChangesTab changes={s.changes} />
        </Tab>
        <Tab value="specs" label={`Specs (${s.specs.length})`}>
          <SpecsTab specs={s.specs} />
        </Tab>
        <Tab value="stages" label="Stages">
          <StagesTab />
        </Tab>
      </Tabs>
    </Stack>
  )
}
