// The OpenSpec board: a Kanban view of the focused workspace's changes, opened as a main-area
// editor tab for `openspec/board.openspec`. Plain DOM (custom editors get no Orca components).
// Data and agent launches go through the same worker as the sidebar panel.
import type { ChangeFileInfo, ChangeInfo, OpenSpecState, OpsxStep, SpecUseInfo } from '../src/protocol'
import { filterByName, progressText, statusOf, type Status } from '../src/view'
import { parse, toDom } from './markdown'

const BATCH = 40
const plugin = orca.plugin

const COLUMNS: { status: Status; color: string }[] = [
  { status: 'Planning', color: 'var(--s-planning)' },
  { status: 'Not started', color: 'var(--s-idle)' },
  { status: 'In progress', color: 'var(--orca-primary)' },
  { status: 'Ready to archive', color: 'var(--s-done)' }
]

const CSS = `
:root { color-scheme: dark; --s-planning: #E8A15A; --s-idle: #8A8A92; --s-done: #4CC38A; --s-archived: #A78BFA; }
:root.light { color-scheme: light; --s-planning: #B45309; --s-idle: #6B6B73; --s-done: #15803D; --s-archived: #7C3AED; }
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: var(--orca-background);
  color: var(--orca-foreground); font: 13px/1.45 var(--orca-font-sans, system-ui, sans-serif); }
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
.muted { color: var(--orca-muted-foreground); }
header { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--orca-border); flex-wrap: wrap; }
.title { all: unset; cursor: pointer; display: flex; flex-direction: column; min-width: 0; }
.title:focus-visible { outline: 2px solid var(--orca-ring); outline-offset: 2px; border-radius: 4px; }
.title b { font-size: 15px; }
.btn { height: 28px; padding: 0 11px; border-radius: 7px; border: 1px solid var(--orca-border); background: transparent; font-size: 12px; white-space: nowrap; }
.btn:hover { border-color: var(--orca-primary); }
.btn.primary { background: var(--orca-primary); color: var(--orca-primary-foreground); border-color: transparent; font-weight: 600; }
.btn.danger { background: var(--orca-destructive); color: var(--orca-destructive-foreground); border-color: transparent; font-weight: 600; }
.btn.sm { height: 24px; padding: 0 8px; font-size: 11px; }
.btn:disabled { opacity: .5; cursor: default; }
.search { height: 30px; width: 240px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--orca-input, var(--orca-border)); background: transparent; }
.spacer { flex: 1; }
.form { display: flex; gap: 8px; padding: 10px 18px; border-bottom: 1px solid var(--orca-border); align-items: flex-start; }
.form textarea { flex: 1; min-height: 56px; padding: 8px; border-radius: 6px; border: 1px solid var(--orca-input, var(--orca-border)); background: transparent; resize: vertical; }
.picker { display: flex; gap: 8px; align-items: center; padding: 8px 18px; border-bottom: 1px solid var(--orca-border); font-size: 12px; }
.picker select, .picker input { height: 28px; border-radius: 7px; border: 1px solid var(--orca-input, var(--orca-border)); background: var(--orca-background); padding: 0 8px; }
.note { padding: 6px 18px; font-size: 12px; }
.note.err { color: var(--orca-destructive); }
.body { flex: 1; min-height: 0; display: flex; }
.pane { flex: 1; min-width: 0; overflow: auto; }
.cols { display: grid; grid-template-columns: repeat(5, minmax(210px, 1fr)); gap: 12px; padding: 14px 18px; min-width: 1100px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 8px; min-width: 0; background: var(--orca-card); color: var(--orca-card-foreground); border: 1px solid var(--orca-border); border-radius: 10px; padding: 10px; }
.colhead { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.colhead button { all: unset; cursor: pointer; display: flex; gap: 8px; align-items: center; flex: 1; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.count { margin-left: auto; padding: 1px 7px; border-radius: 999px; background: var(--orca-muted); font-weight: 500; }
.scroll { display: flex; flex-direction: column; gap: 8px; max-height: 70vh; overflow: auto; }
.card { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; border: 1px solid var(--orca-border); background: var(--orca-background); }
.card:hover, .card:focus-within { border-color: var(--orca-primary); }
.card .open { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.card .open:focus-visible { outline: 2px solid var(--orca-ring); outline-offset: 4px; border-radius: 4px; }
.name { font-weight: 600; overflow-wrap: anywhere; }
.summary { font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.meta .date { margin-left: auto; }
.bar { width: 64px; height: 5px; border-radius: 3px; background: var(--orca-muted); overflow: hidden; flex: none; }
.bar i { display: block; height: 100%; background: var(--s-done); }
.next { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick { display: none; gap: 6px; }
.card:hover .quick, .card:focus-within .quick { display: flex; }
.empty { font-size: 12px; padding: 14px 6px; text-align: center; border: 1px dashed var(--orca-border); border-radius: 8px; }
.detail { max-width: 1180px; margin: 0 auto; padding: 14px 18px 30px; }
.crumb { display: flex; gap: 6px; align-items: center; font-size: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.crumb a { cursor: pointer; color: var(--orca-muted-foreground); }
.crumb a:hover { color: var(--orca-foreground); }
.hero { border: 1px solid var(--orca-border); border-radius: 12px; background: var(--orca-card); padding: 16px 18px; display: flex; flex-direction: column; gap: 9px; }
.hero h2 { margin: 0; font-size: 19px; overflow-wrap: anywhere; }
.status { display: inline-flex; padding: 1px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid currentColor; }
.sub, .actions, .chips { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.chip { padding: 1px 8px; border-radius: 6px; border: 1px solid var(--orca-border); font: 11px var(--orca-font-mono, ui-monospace, monospace); background: var(--orca-muted); }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; margin-top: 14px; align-items: start; }
.doc, .box { border: 1px solid var(--orca-border); border-radius: 12px; background: var(--orca-card); min-width: 0; }
.doc { overflow: hidden; }
.tabs { display: flex; gap: 4px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--orca-border); overflow-x: auto; }
.grp { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 0 4px 0 10px; color: var(--orca-muted-foreground); white-space: nowrap; }
.tab { border: 1px solid transparent; background: none; color: var(--orca-muted-foreground); padding: 4px 10px; border-radius: 6px; font-size: 12px; white-space: nowrap; }
.tab.on { color: var(--orca-foreground); background: var(--orca-background); border-color: var(--orca-border); font-weight: 600; }
.pathbar { display: flex; align-items: center; gap: 8px; padding: 6px 16px; border-bottom: 1px solid var(--orca-border); font: 11px var(--orca-font-mono, ui-monospace, monospace); }
.pathbar span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md { padding: 4px 22px 22px; max-width: 800px; overflow-wrap: anywhere; }
.md h1 { font-size: 18px; } .md h2 { font-size: 16px; margin-top: 20px; } .md h3 { font-size: 14px; margin-top: 16px; } .md h4 { font-size: 13px; }
.md p, .md li { line-height: 1.6; }
.md code { font: 12px var(--orca-font-mono, ui-monospace, monospace); background: var(--orca-muted); padding: 1px 5px; border-radius: 4px; }
.md pre { background: var(--orca-muted); padding: 10px 12px; border-radius: 8px; overflow: auto; }
.md pre code { background: none; padding: 0; }
.md .requirement { border-left: 3px solid var(--s-archived); padding-left: 10px; }
.md .scenario-title { color: var(--s-planning); }
.md blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid var(--orca-border); color: var(--orca-muted-foreground); }
.md li.task { list-style: none; margin-left: -20px; padding-left: 24px; position: relative; }
.md li.task .chk { position: absolute; left: 0; top: .3em; width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid var(--orca-border); display: grid; place-items: center; font-size: 10px; line-height: 1; }
.md li.task .chk.on { background: var(--s-done); border-color: var(--s-done); color: var(--orca-background); }
.md li.task.done { color: var(--orca-muted-foreground); }
.side { display: flex; flex-direction: column; gap: 12px; }
.box { padding: 12px 14px; }
.box h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--orca-muted-foreground); }
.rel { all: unset; cursor: pointer; display: block; padding: 7px 9px; border-radius: 7px; border: 1px solid var(--orca-border); margin-top: 6px; font-size: 12px; overflow-wrap: anywhere; }
.rel:hover { border-color: var(--orca-primary); }
.rel:focus-visible { outline: 2px solid var(--orca-ring); outline-offset: 1px; }
.drawer { width: 300px; flex: none; border-left: 1px solid var(--orca-border); display: flex; flex-direction: column; min-height: 0; }
.drawer .head { padding: 12px 14px 8px; display: flex; gap: 8px; align-items: center; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.drawer .search { width: auto; margin: 0 14px 8px; }
.drawer ul { list-style: none; margin: 0; padding: 0 8px 8px; overflow: auto; flex: 1; }
.drawer li button { all: unset; cursor: pointer; display: block; width: 100%; padding: 6px 8px; border-radius: 6px; font-size: 12px; overflow-wrap: anywhere; }
.drawer li button:hover { background: var(--orca-muted); }
.drawer li button:focus-visible { outline: 2px solid var(--orca-ring); }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; }
.dialog { width: min(440px, 90vw); background: var(--orca-card); color: var(--orca-card-foreground); border: 1px solid var(--orca-border); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.dialog h3 { margin: 0; }
.dialog .picker { padding: 0; border: 0; flex-wrap: wrap; }
.model { position: relative; display: inline-flex; gap: 8px; align-items: center; }
.dd { position: absolute; top: 32px; left: 0; z-index: 20; min-width: 100%; width: max-content; max-width: 420px; max-height: 260px; overflow: auto; background: var(--orca-card); color: var(--orca-card-foreground); border: 1px solid var(--orca-border); border-radius: 8px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.dd[hidden] { display: none; }
.dd .opt { padding: 5px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.dd .opt.on, .dd .opt:hover { background: var(--orca-accent, rgba(127,127,127,.2)); }
.dd-note { padding: 5px 8px; font-size: 11px; opacity: .7; }
.model select, .model input { height: 28px; border-radius: 7px; border: 1px solid var(--orca-input, var(--orca-border)); background: var(--orca-background); color: inherit; padding: 0 8px; }
.dialog .actions { justify-content: flex-end; }
`

type Page = { kind: 'board' } | { kind: 'change'; name: string; archived: boolean } | { kind: 'spec'; name: string }
type Dialog = {
  step: OpsxStep
  change?: string
  description?: string
  agent: string
  model: string
  /** Archive only: the command line and how many tasks are still open. */
  prompt?: string
  unfinished?: number | null
  total?: number | null
  error?: string
  saved?: boolean
}

let state: OpenSpecState | null = null
let lastSignature = ''
let page: Page = { kind: 'board' }
let filter = ''
let formOpen = false
let drawerOpen = false
let specFilter = ''
let specShown = BATCH
let archivedOpen = false
let archived: { items: ChangeInfo[]; total: number } = { items: [], total: 0 }
let note: { text: string; error: boolean } | null = null
let dialog: Dialog | null = null
let boardScroll = 0
/** Bumped on every navigation so a slow response for a page the user left is dropped. */
let navSeq = 0
let busy = false
let agents: string[] = []
let launchAgent = ''
let launchModel = ''

type Attrs = Record<string, string | boolean | ((e: Event) => void) | undefined>

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (typeof value === 'function') el.addEventListener(key.slice(2), value)
    else if (key === 'class') el.className = String(value)
    else el.setAttribute(key, value === true ? '' : value)
  }
  for (const child of children) if (child) el.append(typeof child === 'string' ? document.createTextNode(child) : child)
  return el
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
const style = document.createElement('style')
style.textContent = CSS
document.head.append(style)

const header = h('header')
const pickEl = h('div', { class: 'picker' })
const noteEl = h('div')
const formEl = h('div')
const bodyEl = h('div', { class: 'body' })
document.body.append(header, pickEl, formEl, noteEl, bodyEl)

function say(text: string | null, error = false): void {
  note = text ? { text, error } : null
  renderNote()
}

function renderNote(): void {
  noteEl.className = note ? (note.error ? 'note err' : 'note muted') : ''
  noteEl.textContent = note?.text ?? ''
  noteEl.setAttribute('role', note?.error ? 'alert' : 'status')
}

let modelSeq = 0

/** Search box over the model list: type to filter, arrows and Enter to pick, any text is accepted as a custom model. */
function modelControl(agent: string, model: string, onChange: (value: string) => void): HTMLElement {
  const wrap = h('span', { class: 'model' })
  const dropdown = h('div', { class: 'dd', role: 'listbox', hidden: true })
  let active = -1
  let shown: { id: string; name: string }[] = []
  const input = h('input', {
    type: 'text',
    'aria-label': 'Model',
    placeholder: 'CLI default - type to search',
    autocomplete: 'off',
    value: model
  })

  const close = (): void => {
    dropdown.hidden = true
    active = -1
  }
  const pick = (id: string): void => {
    input.value = id
    onChange(id)
    close()
  }
  const paint = (total: number, fallback: boolean): void => {
    dropdown.replaceChildren(
      ...(fallback ? [h('div', { class: 'dd-note' }, 'Full model list unavailable (offline?). Built-in suggestions only; type any name.')] : []),
      ...shown.map((m, i) =>
        h(
          'div',
          {
            class: i === active ? 'opt on' : 'opt',
            role: 'option',
            onmousedown: (e) => {
              e.preventDefault()
              pick(m.id)
            }
          },
          h('b', {}, m.id),
          m.name !== m.id ? h('span', { class: 'muted' }, ` ${m.name}`) : null
        )
      ),
      ...(total > shown.length ? [h('div', { class: 'dd-note' }, `${total - shown.length} more - keep typing to narrow the list.`)] : [])
    )
    if (!shown.length && !fallback)
      dropdown.replaceChildren(h('div', { class: 'dd-note' }, input.value.trim() ? `No listed model matches. "${input.value.trim()}" will be used as typed.` : 'No models listed.'))
    dropdown.hidden = false
    dropdown.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }
  const search = async (): Promise<void> => {
    const seq = ++modelSeq
    try {
      const r = await plugin.request('openspec.models', { agent, query: input.value.trim(), limit: 50 })
      if (seq !== modelSeq) return
      shown = r.items
      active = -1
      paint(r.total, r.catalog === 'fallback')
    } catch {
      // typing a model by hand still works
    }
  }

  input.addEventListener('focus', () => void search())
  input.addEventListener('input', () => {
    onChange(input.value)
    void search()
  })
  input.addEventListener('blur', () => setTimeout(close, 100))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dropdown.hidden) {
      e.stopPropagation()
      close()
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) {
      e.preventDefault()
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length
      dropdown.hidden = false
      paint(shown.length, false)
    } else if (e.key === 'Enter' && !dropdown.hidden && active >= 0) {
      e.preventDefault()
      e.stopPropagation()
      pick(shown[active].id)
    }
  })
  wrap.append(input, dropdown)
  return wrap
}

async function doLaunch(d: Dialog): Promise<void> {
  if (busy) return
  busy = true
  say(`Starting ${d.step}${d.change ? ` for ${d.change}` : ''}…`)
  try {
    await plugin.request('openspec.launch', {
      step: d.step,
      ...(d.change ? { change: d.change } : {}),
      ...(d.description ? { description: d.description } : {}),
      ...(d.agent ? { agent: d.agent } : {}),
      model: d.model.trim()
    })
    say(null)
  } catch (err) {
    say(message(err), true)
  } finally {
    busy = false
  }
}

/** Opens the launch dialog for a stage, prefilled with that stage's default; nothing starts until Launch. */
async function launch(step: OpsxStep, change?: string, description?: string, extra: Partial<Dialog> = {}): Promise<void> {
  if (busy) return
  let choice: { agent: string; model: string; ask?: boolean } = { agent: launchAgent || agents[0] || 'claude', model: launchModel }
  let error: string | undefined
  try {
    choice = await plugin.request('openspec.stageChoice', { step })
  } catch (err) {
    error = message(err)
  }
  if (choice.ask === false) return void (await doLaunch({ step, change, description, agent: choice.agent, model: choice.model }))
  dialog = { step, change, description, ...choice, ...extra, error }
  renderDialog()
}

async function confirmArchive(change: string): Promise<void> {
  try {
    const { prompt } = await plugin.request('openspec.promptFor', { step: 'archive', change })
    const info = state?.changes.find((c) => c.name === change)
    const unfinished = info && info.total !== null && info.done < info.total ? info.total - info.done : null
    await launch('archive', change, undefined, { prompt, unfinished, total: info?.total ?? null })
  } catch (err) {
    say(message(err), true)
  }
}

let overlay: HTMLElement | null = null

function closeDialog(): void {
  dialog = null
  overlay?.remove()
  overlay = null
}

function renderDialog(): void {
  overlay?.remove()
  overlay = null
  if (!dialog) return
  const d = dialog
  const agent = d.agent || agents[0] || 'claude'
  const select = h(
    'select',
    {
      'aria-label': 'Agent',
      onchange: () => {
        d.agent = select.value
        d.model = ''
        d.saved = false
        renderDialog()
      }
    },
    ...(agents.length ? agents : [agent]).map((a) => h('option', { value: a, selected: a === agent }, a))
  )
  const input = modelControl(agent, d.model, (value) => {
    d.model = value
    d.saved = false
  })
  const label = d.step[0].toUpperCase() + d.step.slice(1)
  const cancel = h('button', { class: 'btn', onclick: closeDialog }, 'Cancel')
  const save = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        try {
          await plugin.request('openspec.saveStageChoice', { step: d.step, agent, model: d.model.trim() })
          d.saved = true
          d.error = undefined
        } catch (err) {
          d.error = message(err)
        }
        renderDialog()
      }
    },
    'Save as default'
  )
  const never = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        try {
          await plugin.request('openspec.saveStageChoice', { step: d.step, agent, model: d.model.trim(), ask: false })
          d.saved = true
          d.error = undefined
          say(`${d.step} will launch directly next time. Change it in the panel's Stages tab.`)
        } catch (err) {
          d.error = message(err)
        }
        renderDialog()
      }
    },
    "Don't ask again"
  )
  const confirm = h(
    'button',
    {
      class: d.step === 'archive' ? 'btn danger' : 'btn primary',
      onclick: () => {
        closeDialog()
        void doLaunch({ ...d, agent })
      }
    },
    label
  )
  overlay = h(
    'div',
    {
      class: 'overlay',
      onclick: (e) => {
        if (e.target === overlay) closeDialog()
      }
    },
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${label}${d.change ? ` ${d.change}` : ''}` },
      h('h3', {}, d.step === 'archive' ? `Archive ${d.change}?` : `${label}${d.change ? `: ${d.change}` : ''}`),
      d.prompt ? h('div', {}, 'This sends to a new agent: ', h('code', {}, d.prompt)) : null,
      d.unfinished
        ? h('div', { class: 'note err' }, `${d.unfinished} of ${d.total} tasks ${d.unfinished === 1 ? 'is' : 'are'} not done.`)
        : null,
      h('div', { class: 'picker' }, select, input),
      d.error ? h('div', { class: 'note err', role: 'alert' }, d.error) : null,
      d.saved ? h('div', { class: 'note muted' }, `Saved as the default for ${d.step}.`) : null,
      h('div', { class: 'actions' }, save, never, cancel, confirm)
    )
  )
  document.body.append(overlay)
  confirm.focus()
}

function bar(c: ChangeInfo): HTMLElement | null {
  if (c.total === null) return null
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0
  const i = h('i')
  i.style.width = `${pct}%`
  return h('span', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, i)
}

function actionsFor(c: ChangeInfo, status: Status): HTMLElement[] {
  const apply = h('button', { class: 'btn sm primary', onclick: () => void launch('apply', c.name) }, 'Apply')
  const verify = h('button', { class: 'btn sm', onclick: () => void launch('verify', c.name) }, 'Verify')
  const archive = h('button', { class: 'btn sm', onclick: () => void confirmArchive(c.name) }, 'Archive')
  if (status === 'Ready to archive') return [archive]
  if (status === 'In progress') return [apply, verify]
  return [apply]
}

function card(c: ChangeInfo, isArchived: boolean): HTMLElement {
  const status = statusOf(c)
  return h(
    'div',
    { class: 'card' },
    h(
      'button',
      { class: 'open', onclick: () => go({ kind: 'change', name: c.name, archived: isArchived }) },
      h('span', { class: 'name' }, c.name),
      c.summary ? h('span', { class: 'summary' }, c.summary) : null,
      h('span', { class: 'meta muted' }, bar(c), c.total === null ? null : progressText(c), c.created ? h('span', { class: 'date' }, c.created) : null),
      c.next && !isArchived ? h('span', { class: 'next muted' }, `Next: ${c.next}`) : null
    ),
    isArchived ? null : h('div', { class: 'quick' }, ...actionsFor(c, status))
  )
}

function matches(c: ChangeInfo): boolean {
  return filterByName([c], filter, (x) => `${x.name} ${x.summary ?? ''}`).length > 0
}

function column(title: string, color: string, count: number, cards: HTMLElement[], empty: string, toggle?: () => void): HTMLElement {
  const head = toggle
    ? h('button', { onclick: toggle, 'aria-expanded': String(archivedOpen) }, h('span', { class: 'dot' }), title, h('span', { class: 'count' }, String(count)))
    : h('span', { class: 'colhead', style: '' }, h('span', { class: 'dot' }), title, h('span', { class: 'count' }, String(count)))
  const dot = head.querySelector<HTMLElement>('.dot')
  if (dot) dot.style.background = color
  return h(
    'section',
    { class: 'col', 'aria-label': title },
    toggle ? h('div', { class: 'colhead' }, head) : head,
    ...(cards.length ? [h('div', { class: 'scroll' }, ...cards)] : empty ? [h('div', { class: 'empty muted' }, empty)] : [])
  )
}

async function loadArchived(more = false): Promise<void> {
  const seq = navSeq
  try {
    const offset = more ? archived.items.length : 0
    const limit = more ? BATCH : Math.max(BATCH, archived.items.length)
    const r = await plugin.request('openspec.archived', { offset, limit, filter })
    if (seq !== navSeq && more) return
    archived = { total: r.total, items: more ? [...archived.items, ...r.items] : r.items }
    if (page.kind === 'board') renderBoard()
  } catch (err) {
    say(message(err), true)
  }
}

function renderBoard(): void {
  if (!state) return
  const changes = state.changes.filter(matches)
  const cols = COLUMNS.map(({ status, color }) => {
    const items = changes.filter((c) => statusOf(c) === status)
    return column(status, color, items.length, items.map((c) => card(c, false)), 'Nothing here')
  })
  const archivedCards = archivedOpen ? archived.items.map((c) => card(c, true)) : []
  const archivedCol = column(
    'Archived',
    'var(--s-archived)',
    archived.total,
    archivedCards,
    archivedOpen ? 'No archived changes' : '',
    () => {
      archivedOpen = !archivedOpen
      renderBoard()
    }
  )
  if (archivedOpen && archived.items.length < archived.total) {
    const scroll = archivedCol.querySelector<HTMLElement>('.scroll')
    const more = h('button', { class: 'btn sm', onclick: () => void loadArchived(true) }, 'Load more')
    scroll?.append(more)
    scroll?.addEventListener('scroll', () => {
      if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40) void loadArchived(true)
    })
  }
  const pane = h('div', { class: 'pane' }, h('div', { class: 'cols' }, ...cols, archivedCol))
  bodyEl.replaceChildren(pane, ...(drawerOpen ? [drawer()] : []))
  pane.scrollTop = boardScroll
  pane.addEventListener('scroll', () => (boardScroll = pane.scrollTop))
}

function drawer(): HTMLElement {
  const all = filterByName(state?.specs ?? [], specFilter, (s) => s)
  const list = h('ul')
  const fill = (): void => {
    for (const spec of all.slice(list.children.length, specShown)) {
      list.append(h('li', {}, h('button', { onclick: () => go({ kind: 'spec', name: spec }) }, spec)))
    }
  }
  fill()
  list.addEventListener('scroll', () => {
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 40 && specShown < all.length) {
      specShown += BATCH
      fill()
    }
  })
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Filter specs',
    'aria-label': 'Filter specs',
    value: specFilter,
    oninput: () => {
      specFilter = search.value
      specShown = BATCH
      const next = drawer()
      document.querySelector('.drawer')?.replaceWith(next)
      document.querySelector<HTMLInputElement>('.drawer .search')?.focus()
    }
  })
  return h(
    'aside',
    { class: 'drawer', 'aria-label': 'Specs' },
    h('div', { class: 'head' }, `Specs (${all.length})`, h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onclick: toggleDrawer }, 'Close')),
    search,
    list
  )
}

function toggleDrawer(): void {
  drawerOpen = !drawerOpen
  if (page.kind === 'board') renderBoard()
  else render()
}

function go(next: Page): void {
  if (page.kind === 'board' && next.kind !== 'board') boardScroll = bodyEl.querySelector('.pane')?.scrollTop ?? boardScroll
  page = next
  navSeq++
  render()
}

function crumbs(last: string): HTMLElement {
  return h(
    'div',
    { class: 'crumb' },
    h('button', { class: 'btn sm', onclick: () => go({ kind: 'board' }) }, '← Back'),
    h('a', { role: 'link', tabindex: '0', onclick: () => go({ kind: 'board' }), onkeydown: (e) => { if ((e as KeyboardEvent).key === 'Enter') go({ kind: 'board' }) } }, 'Board'),
    h('span', { class: 'muted' }, '/'),
    h('span', {}, last),
    h('span', { class: 'muted' }, 'Esc to go back')
  )
}

function relList(items: SpecUseInfo[], title: string): HTMLElement {
  return h(
    'div',
    { class: 'box' },
    h('h4', {}, title),
    ...(items.length
      ? items.map((r) =>
          h('button', { class: 'rel', onclick: () => go({ kind: 'change', name: r.name, archived: r.archived }) }, r.name, r.archived ? h('small', { class: 'muted' }, 'archived') : null)
        )
      : [h('div', { class: 'muted' }, 'None')])
  )
}

async function showFile(view: HTMLElement, path: string, seq: number): Promise<void> {
  view.replaceChildren(h('div', { class: 'md muted' }, 'Loading…'))
  try {
    const { text } = await plugin.request('openspec.readFile', { path })
    if (seq !== navSeq) return
    const md = h('div', { class: 'md' })
    toDom(md, parse(text))
    view.replaceChildren(
      h('div', { class: 'pathbar' }, h('span', {}, `openspec/${path}`), h('button', { class: 'btn sm', onclick: () => void openFile(path) }, 'Edit ↗')),
      md
    )
  } catch (err) {
    if (seq === navSeq) view.replaceChildren(h('div', { class: 'note err' }, message(err)))
  }
}

async function openFile(path: string): Promise<void> {
  try {
    await plugin.request('openspec.openFile', { path })
  } catch (err) {
    say(message(err), true)
  }
}

async function renderChange(p: Extract<Page, { kind: 'change' }>): Promise<void> {
  const seq = navSeq
  bodyEl.replaceChildren(h('div', { class: 'pane' }, h('div', { class: 'detail muted' }, 'Loading…')))
  try {
    const { files, specs, related } = await plugin.request('openspec.changeFiles', { change: p.name, archived: p.archived })
    if (seq !== navSeq) return
    const info = state?.changes.find((c) => c.name === p.name)
    const status = p.archived ? 'Archived' : info ? statusOf(info) : 'Planning'
    const dateMatch = /^(\d{4}-\d{2}-\d{2})-/.exec(p.name)
    const created = info?.created ?? dateMatch?.[1]
    const view = h('div', { class: 'doc-view' })
    const tabs = h('div', { class: 'tabs', role: 'tablist' })
    let selected = files.find((f) => f.label === 'proposal.md') ?? files[0]
    const drawTabs = (): void => {
      tabs.replaceChildren()
      for (const [group, title] of [['docs', 'Docs'], ['other', 'Other'], ['delta', 'Spec deltas']] as const) {
        const inGroup = files.filter((f) => f.group === group)
        if (!inGroup.length) continue
        tabs.append(h('span', { class: 'grp' }, title))
        for (const f of inGroup) tabs.append(tab(f))
      }
    }
    const tab = (f: ChangeFileInfo): HTMLElement =>
      h('button', {
        class: f === selected ? 'tab on' : 'tab',
        role: 'tab',
        'aria-selected': String(f === selected),
        onclick: () => {
          selected = f
          drawTabs()
          void showFile(view, f.path, navSeq)
        }
      }, f.label)
    drawTabs()
    const edit = h('button', { class: 'btn', onclick: () => selected && void openFile(selected.path) }, 'Open in editor')
    const actions = p.archived
      ? [edit]
      : [
          ...(status === 'Ready to archive'
            ? []
            : [h('button', { class: 'btn primary', onclick: () => void launch('apply', p.name) }, 'Apply')]),
          h('button', { class: 'btn', onclick: () => void launch('verify', p.name) }, 'Verify'),
          h('button', { class: 'btn', onclick: () => void launch('explore', p.name) }, 'Explore'),
          edit,
          h('button', { class: 'btn', onclick: () => void confirmArchive(p.name) }, 'Archive')
        ]
    const statusEl = h('span', { class: 'status' }, status)
    statusEl.style.color = COLUMNS.find((c) => c.status === status)?.color ?? 'var(--s-archived)'
    const detail = h(
      'div',
      { class: 'detail' },
      crumbs(p.name),
      h(
        'div',
        { class: 'hero' },
        h('h2', {}, h('button', { class: 'title', onclick: () => go({ kind: 'board' }) }, p.name)),
        h('div', { class: 'sub' }, statusEl, info ? bar(info) : null, info ? progressText(info) : null, created ? `Created ${created}` : null),
        specs.length ? h('div', { class: 'chips' }, 'Specs:', ...specs.map((s) => h('span', { class: 'chip' }, s))) : null,
        h('div', { class: 'actions' }, ...actions)
      ),
      h(
        'div',
        { class: 'layout' },
        h('div', { class: 'doc' }, tabs, view),
        h('div', { class: 'side' }, h('div', { class: 'box' }, h('h4', {}, 'Workspace'), state?.workspace ?? ''), relList(related, 'Related changes'))
      )
    )
    bodyEl.replaceChildren(h('div', { class: 'pane' }, detail))
    if (selected) void showFile(view, selected.path, seq)
    else view.replaceChildren(h('div', { class: 'md muted' }, 'No markdown files.'))
  } catch (err) {
    if (seq === navSeq) bodyEl.replaceChildren(h('div', { class: 'pane' }, h('div', { class: 'detail' }, crumbs(p.name), h('div', { class: 'note err' }, message(err)))))
  }
}

async function renderSpec(p: Extract<Page, { kind: 'spec' }>): Promise<void> {
  const seq = navSeq
  bodyEl.replaceChildren(h('div', { class: 'pane' }, h('div', { class: 'detail muted' }, 'Loading…')))
  try {
    const { path, changedBy } = await plugin.request('openspec.specInfo', { spec: p.name })
    if (seq !== navSeq) return
    const view = h('div', { class: 'doc-view' })
    bodyEl.replaceChildren(
      h(
        'div',
        { class: 'pane' },
        h(
          'div',
          { class: 'detail' },
          crumbs(`spec ${p.name}`),
          h('div', { class: 'layout' }, h('div', { class: 'doc' }, view), h('div', { class: 'side' }, relList(changedBy, 'Changed by')))
        )
      )
    )
    void showFile(view, path, seq)
  } catch (err) {
    if (seq === navSeq) bodyEl.replaceChildren(h('div', { class: 'pane' }, h('div', { class: 'detail' }, crumbs(p.name), h('div', { class: 'note err' }, message(err)))))
  }
}

function renderHeader(): void {
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Filter changes',
    'aria-label': 'Filter changes',
    value: filter,
    oninput: () => {
      filter = search.value
      if (page.kind === 'board') {
        renderBoard()
        void loadArchived()
      }
    }
  })
  header.replaceChildren(
    h('button', { class: 'title', onclick: () => go({ kind: 'board' }) }, h('b', {}, state?.workspace ?? 'OpenSpec'), h('span', { class: 'muted' }, 'OpenSpec board')),
    search,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', onclick: () => { formOpen = !formOpen; renderForm() } }, 'New change'),
    h('button', { class: 'btn', onclick: toggleDrawer, 'aria-expanded': String(drawerOpen) }, 'Specs'),
    h('button', { class: 'btn', onclick: () => void refresh() }, 'Refresh')
  )
}

function renderPicker(): void {
  const agent = launchAgent || agents[0] || 'claude'
  const select = h('select', {
    'aria-label': 'Agent',
    onchange: () => {
      launchAgent = select.value
      launchModel = ''
      void orca.storage.set('launchAgent', launchAgent)
      void orca.storage.set('launchModel', '')
      renderPicker()
    }
  }, ...(agents.length ? agents : [agent]).map((a) => h('option', { value: a, selected: a === agent }, a)))
  const input = modelControl(agent, launchModel, (value) => {
    launchModel = value.trim()
    void orca.storage.set('launchModel', launchModel)
  })
  const refreshBtn = h('button', {
    class: 'btn sm',
    onclick: async () => {
      refreshBtn.disabled = true
      try {
        const r = await plugin.request('openspec.refreshModels')
        say(r.catalog === 'ready' ? 'Model list refreshed.' : 'Could not load the full model list; showing built-in suggestions.', r.catalog !== 'ready')
      } catch (err) {
        say(message(err), true)
      } finally {
        refreshBtn.disabled = false
      }
    }
  }, 'Refresh models')
  pickEl.replaceChildren(h('span', { class: 'muted' }, 'Run with'), select, input, refreshBtn)
}

async function loadChoice(): Promise<void> {
  try {
    const r = await plugin.request('openspec.agents')
    agents = r.agents
    const savedAgent = await orca.storage.get('launchAgent')
    const savedModel = await orca.storage.get('launchModel')
    launchAgent = typeof savedAgent === 'string' && savedAgent ? savedAgent : r.defaultAgent
    launchModel = typeof savedModel === 'string' ? savedModel.trim() : ''
  } catch (err) {
    say(message(err), true)
  }
  renderPicker()
}

function renderForm(): void {
  formEl.className = ''
  if (!formOpen) return void formEl.replaceChildren()
  const text = h('textarea', { 'aria-label': 'Change description', placeholder: 'Describe the change…' })
  const start = (step: OpsxStep): void => {
    const value = text.value.trim()
    if (!value) return say('Describe the change first.', true)
    formOpen = false
    renderForm()
    void launch(step, undefined, value)
  }
  formEl.className = 'form'
  formEl.replaceChildren(
    text,
    h('button', { class: 'btn', onclick: () => start('explore') }, 'Explore'),
    h('button', { class: 'btn primary', onclick: () => start('propose') }, 'Propose')
  )
  text.focus()
}

function render(): void {
  renderHeader()
  if (page.kind === 'board') renderBoard()
  else if (page.kind === 'change') void renderChange(page)
  else void renderSpec(page)
}

function receive(next: OpenSpecState): void {
  const signature = JSON.stringify(next)
  state = next
  if (signature === lastSignature) return
  lastSignature = signature
  if (next.status !== 'ok') {
    bodyEl.replaceChildren(
      h('div', { class: 'pane' }, h('div', { class: 'empty muted' }, next.status === 'error' ? `Could not read OpenSpec: ${next.error}` : 'Open a local workspace with OpenSpec set up.'))
    )
    renderHeader()
    return
  }
  renderHeader()
  if (page.kind === 'board') renderBoard()
  else if (page.kind === 'change') void renderChange(page)
  void loadArchived()
}

async function refresh(): Promise<void> {
  try {
    receive(await plugin.request('openspec.refresh'))
  } catch (err) {
    say(message(err), true)
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (dialog) closeDialog()
  else if (page.kind !== 'board') go({ kind: 'board' })
})

void loadChoice()
plugin.on('openspec.changed', receive)
const showTarget = (t: { spec?: string | null; change?: string | null; archived?: boolean }): void => {
  if (t.spec) go({ kind: 'spec', name: t.spec })
  else if (t.change) go({ kind: 'change', name: t.change, archived: t.archived === true })
}
plugin.on('openspec.showSpec', ({ spec }) => {
  showTarget({ spec })
  void plugin.request('openspec.takeBoardTarget')
})
plugin.on('openspec.showChange', ({ change, archived }) => {
  showTarget({ change, archived })
  void plugin.request('openspec.takeBoardTarget')
})
void plugin
  .request('openspec.takeBoardTarget')
  .then(showTarget)
  .catch(() => undefined)
void plugin
  .request('openspec.state')
  .then(receive)
  .catch((err) => say(message(err), true))
