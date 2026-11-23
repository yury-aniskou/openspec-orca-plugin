// Builds the command line that starts an agent CLI with a chosen model. Pure, unit-tested.

/** The executable behind each agent kind Orca knows. */
const BINARY: Record<string, string> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  opencode: 'opencode',
  cursor: 'cursor-agent',
  copilot: 'copilot'
}

/** Model flag templates; `{model}` is replaced by the validated model. */
export const DEFAULT_FLAGS: Record<string, string> = {
  claude: '--model {model}',
  codex: '--model {model}',
  gemini: '--model {model}',
  opencode: '--model {model}',
  cursor: '--model {model}',
  copilot: '--model {model}'
}

/** Suggestions only; any model text is accepted. */
export const SUGGESTED_MODELS: Record<string, string[]> = {
  claude: [
    'opus',
    'sonnet',
    'haiku',
    'opusplan',
    'claude-opus-4-1',
    'claude-sonnet-4-5',
    'claude-haiku-4-5'
  ],
  codex: ['gpt-5', 'gpt-5-codex', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'o3', 'o4-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  opencode: [
    'anthropic/claude-sonnet-4-5',
    'anthropic/claude-opus-4-1',
    'openai/gpt-5',
    'openai/gpt-5-codex',
    'google/gemini-2.5-pro',
    'openrouter/anthropic/claude-sonnet-4.5',
    'ollama/qwen3-coder'
  ],
  cursor: ['auto', 'sonnet-4.5', 'sonnet-4.5-thinking', 'opus-4.1', 'gpt-5', 'gpt-5-codex', 'grok'],
  copilot: ['claude-sonnet-4.5', 'claude-sonnet-4', 'gpt-5']
}

const SAFE = /^[A-Za-z0-9._:/-]+$/

/** Throws unless `model` can be put on a command line without shell syntax. */
export function validateModel(model: string): string {
  const value = model.trim()
  if (!SAFE.test(value)) throw new Error(`Invalid model "${value}": use letters, digits and . _ : / - only.`)
  return value
}

/** Parses a settings value that should be a JSON object of strings; anything else gives {}. */
export function parseStringMap(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch {
    return {}
  }
}

export type ModelItem = { id: string; name: string }
/** The models.dev catalog, slimmed to what the pickers need: provider -> [id, name][]. */
export type Catalog = Record<string, [string, string][]>

/** Reads the models.dev document defensively; anything unexpected is skipped. */
export function slimCatalog(raw: unknown): Catalog {
  const out: Catalog = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [provider, entry] of Object.entries(raw)) {
    const found = (entry as { models?: unknown } | null)?.models
    if (!found || typeof found !== 'object') continue
    const rows: [string, string][] = []
    for (const [key, m] of Object.entries(found)) {
      const id = typeof (m as { id?: unknown })?.id === 'string' ? (m as { id: string }).id : key
      const name = (m as { name?: unknown })?.name
      rows.push([id, typeof name === 'string' && name ? name : id])
    }
    if (rows.length) out[provider] = rows
  }
  return out
}

const PROVIDERS: Record<string, string[]> = {
  claude: ['anthropic'],
  codex: ['openai'],
  gemini: ['google'],
  cursor: ['anthropic', 'openai', 'google'],
  copilot: ['github-copilot', 'anthropic', 'openai', 'google']
}

/** Agents whose own CLI can list the models it accepts: the executable and its arguments. */
export const CLI_LIST: Record<string, [string, string[]]> = {
  cursor: ['cursor-agent', ['--list-models']],
  opencode: ['opencode', ['models']]
}

/** Parses `id - Name` or bare `id` lines from a CLI's model listing; headers and noise are skipped. */
export function parseCliModels(text: string): ModelItem[] {
  const items: ModelItem[] = []
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
  for (const line of clean.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._:/-]*)(?:\s+-\s+(.+?))?\s*$/.exec(line)
    if (m) items.push({ id: m[1], name: m[2] ?? m[1] })
  }
  return items
}

/** Every model for an agent. Cursor lists exactly what its CLI reports; others get built-in suggestions, the CLI's list and the catalog's (opencode gets all providers as provider/model). */
export function modelsFor(agent: string, catalog: Catalog | null, cli: ModelItem[] = []): ModelItem[] {
  if (agent === 'cursor' && cli.length) return cli
  const items: ModelItem[] = [...(SUGGESTED_MODELS[agent] ?? []).map((id) => ({ id, name: id })), ...cli]
  if (catalog) {
    const providers = agent === 'opencode' ? Object.keys(catalog) : (PROVIDERS[agent] ?? [])
    for (const provider of providers)
      for (const [id, name] of catalog[provider] ?? [])
        items.push({ id: agent === 'opencode' ? `${provider}/${id}` : id, name })
  }
  const byId = new Map<string, ModelItem>()
  for (const m of items) {
    const first = byId.get(m.id)
    if (!first) byId.set(m.id, m)
    else if (first.name === first.id) first.name = m.name
  }
  return [...byId.values()]
}

/** Case-insensitive; every word of the query must appear in the id or the name. */
export function filterModels(items: readonly ModelItem[], query: string): ModelItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...items]
  return items.filter((m) => {
    const hay = `${m.id} ${m.name}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** `ask: false` launches the stage straight away with its agent and model, without the dialog. */
export type StageChoice = { agent?: string; model?: string; ask?: boolean }

const STEPS = ['explore', 'propose', 'apply', 'verify', 'archive']

/** Per-stage choices from storage (an object) or the `stageDefaults` setting (JSON text). Bad JSON throws; bad entries are skipped. */
export function parseStageChoices(raw: unknown): Record<string, StageChoice> {
  let value: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return {}
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('The stageDefaults setting is not valid JSON.')
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, StageChoice> = {}
  for (const [step, entry] of Object.entries(value)) {
    if (!STEPS.includes(step) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const { agent, model, ask } = entry as Record<string, unknown>
    out[step] = {
      ...(typeof agent === 'string' && agent.trim() ? { agent: agent.trim() } : {}),
      ...(typeof model === 'string' ? { model: model.trim() } : {}),
      ...(typeof ask === 'boolean' ? { ask } : {})
    }
  }
  return out
}

/** Extra args are split on spaces and each must be a plain token, so no shell syntax gets through. */
function extraTokens(extra: string | undefined): string[] {
  const tokens = (extra ?? '').split(/\s+/).filter(Boolean)
  for (const t of tokens) if (!/^[A-Za-z0-9._:/=@-]+$/.test(t)) throw new Error(`Invalid extra argument "${t}".`)
  return tokens
}

export function buildAgentCommand(
  agent: string,
  model: string,
  flags: Record<string, string> = {},
  extra: Record<string, string> = {}
): string {
  const binary = BINARY[agent]
  if (!binary) throw new Error(`Unknown agent "${agent}".`)
  const parts = [binary]
  const value = model.trim() ? validateModel(model) : ''
  if (value) {
    const template = flags[agent] ?? DEFAULT_FLAGS[agent] ?? '--model {model}'
    parts.push(...template.split(/\s+/).filter(Boolean).map((p) => p.replaceAll('{model}', value)))
  }
  parts.push(...extraTokens(extra[agent]))
  return parts.join(' ')
}
