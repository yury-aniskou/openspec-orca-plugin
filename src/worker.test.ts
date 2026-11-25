import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { watchFolder } from './watch'
import * as main from './worker'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'openspec-'))
  mkdirSync(join(root, 'openspec/changes/add-auth'), { recursive: true })
  writeFileSync(join(root, 'openspec/changes/add-auth/tasks.md'), '- [x] a\n- [ ] b\n')
  mkdirSync(join(root, 'openspec/specs/auth'), { recursive: true })
  writeFileSync(join(root, 'openspec/specs/auth/spec.md'), '# auth')
  return root
}

main.cliRunner.run = async () => ''
main.options.readyPollMs = 5
main.options.steadyPolls = 4
main.options.readyTimeoutMs = 200

const READY = { lines: ['  Claude Code', '', '❯ ', '  ⏵⏵ bypass permissions on'], truncated: false }
let tick = 0
const BUSY = () => ({ lines: [`Loading ${tick++}`], truncated: false })

function host(
  path: string,
  settings: Record<string, string> = { agent: 'claude' },
  extra: Record<string, unknown> = {},
  hostId: string | null = 'local'
) {
  return mockHost({
    results: {
      'workspace.readContext': { workspaceId: 'w1', branch: 'main', displayName: 'demo', terminals: [] },
      'workspace.list': {
        workspaces: [{ id: 'w1', kind: 'folder', name: 'demo', path, branch: 'main', hostId }],
        truncated: false
      },
      'agent.launch': { terminalId: 't1' },
      'terminal.create': { terminalId: 't2' },
      'terminal.focus': { focused: true },
      'terminal.read': READY,
      'terminal.sendText': { accepted: true },
      'notifications.show': { delivered: true },
      ...extra
    },
    settings
  })
}

test('promptFor follows the command style', () => {
  assert.equal(main.promptFor('apply', 'add-auth', 'skill'), '/openspec-apply-change add-auth')
  assert.equal(main.promptFor('apply', 'add-auth', 'opsx'), '/opsx:apply add-auth')
  assert.equal(main.promptFor('propose', 'add dark\nmode', 'skill'), '/openspec-propose add dark mode')
})

test('answers state, then launches, shows and types the command', async () => {
  const h = host(fixture())
  const worker = await mountWorker(main, { host: h })
  const state = (await worker.request('openspec.state')) as { status: string; changes: unknown[]; specs: string[] }
  assert.equal(state.status, 'ok')
  assert.equal(state.changes.length, 1)
  assert.deepEqual(state.specs, ['auth'])
  await worker.request('openspec.launch', { step: 'apply', change: 'add-auth' })
  assert.deepEqual(h.callsOf('agent.launch'), [{ workspaceId: 'w1', agent: 'claude' }])
  assert.deepEqual(h.callsOf('terminal.focus'), [{ terminalId: 't1' }])
  await main.whenDelivered()
  assert.deepEqual(h.callsOf('terminal.sendText'), [
    { terminalId: 't1', text: '/openspec-apply-change add-auth', enter: true }
  ])
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('opsx style and form description', async () => {
  const h = host(fixture(), { agent: 'claude', commandStyle: 'opsx' })
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'explore', description: 'add dark mode', agent: 'codex' })
  assert.deepEqual(h.callsOf('agent.launch'), [{ workspaceId: 'w1', agent: 'codex' }])
  await main.whenDelivered()
  assert.deepEqual(h.callsOf('terminal.sendText'), [
    { terminalId: 't1', text: '/opsx:explore add dark mode', enter: true }
  ])
  assert.equal(h.callsOf('workspace.create').length, 0)
  await worker.deactivate()
})

function gitHost(extra: Record<string, unknown> = {}) {
  return host(
    fixture(),
    { agent: 'claude' },
    {
      'workspace.list': {
        workspaces: [{ id: 'w1', kind: 'worktree', name: 'demo', projectId: 'p1', path: fixture(), branch: 'main', hostId: 'local' }],
        truncated: false
      },
      'workspace.create': { workspaceId: 'w9' },
      ...extra
    }
  )
}

test('propose creates a worktree and launches there, not in the focused workspace', async () => {
  const h = gitHost()
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'propose', description: 'add dark mode' })
  assert.deepEqual(h.callsOf('workspace.create'), [{ projectId: 'p1', name: 'add-dark-mode', open: true }])
  assert.deepEqual(h.callsOf('agent.launch'), [{ workspaceId: 'w9', agent: 'claude' }])
  await main.whenDelivered()
  assert.deepEqual(h.callsOf('terminal.sendText'), [
    { terminalId: 't1', text: '/openspec-propose add dark mode', enter: true }
  ])
  await worker.deactivate()
})

test('propose launches nothing when the worktree cannot be created', async () => {
  const h = gitHost({
    'workspace.create': () => {
      throw new Error('boom')
    }
  })
  const worker = await mountWorker(main, { host: h })
  await assert.rejects(() => worker.request('openspec.launch', { step: 'propose', description: 'x' }))
  assert.equal(h.callsOf('agent.launch').length, 0)
  assert.equal(h.callsOf('terminal.create').length, 0)
  await worker.deactivate()
})

test('propose in a folder without a project is refused', async () => {
  const h = host(fixture())
  const worker = await mountWorker(main, { host: h })
  await assert.rejects(() => worker.request('openspec.launch', { step: 'propose', description: 'x' }))
  assert.equal(h.callsOf('workspace.create').length, 0)
  assert.equal(h.callsOf('agent.launch').length, 0)
  await worker.deactivate()
})

test('apply, verify and archive stay in the focused workspace', async () => {
  const h = gitHost()
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'apply', change: 'add-auth' })
  assert.equal(h.callsOf('workspace.create').length, 0)
  assert.deepEqual(h.callsOf('agent.launch'), [{ workspaceId: 'w1', agent: 'claude' }])
  await main.whenDelivered()
  await worker.deactivate()
})

test('does not type the command when the agent never becomes ready', async () => {
  const h = host(fixture(), { agent: 'claude' }, { 'terminal.read': BUSY })
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'apply', change: 'add-auth' })
  await main.whenDelivered()
  assert.deepEqual(h.callsOf('terminal.sendText'), [])
  assert.equal(h.callsOf('notifications.show').length, 1)
  await worker.deactivate()
})

test('remote workspaces are reported and never read or launched', async () => {
  const h = host('/does/not/exist', { agent: 'claude' }, {}, 'ssh-1')
  const worker = await mountWorker(main, { host: h })
  const state = (await worker.request('openspec.state')) as { status: string }
  assert.equal(state.status, 'remote')
  await assert.rejects(() => worker.request('openspec.launch', { step: 'apply', change: 'x' }))
  assert.deepEqual(h.callsOf('agent.launch'), [])
  await worker.deactivate()
})

test('workspace without openspec/ reports no-openspec and init opens a terminal', async () => {
  const h = host(mkdtempSync(join(tmpdir(), 'openspec-')))
  const worker = await mountWorker(main, { host: h })
  const state = (await worker.request('openspec.state')) as { status: string }
  assert.equal(state.status, 'no-openspec')
  await worker.request('openspec.init')
  assert.deepEqual(h.callsOf('terminal.create'), [{ workspaceId: 'w1', title: 'openspec init', command: 'openspec init' }])
  await worker.deactivate()
})

test('agents setting comes first in the form list', async () => {
  const h = host(fixture(), { agent: 'gemini' })
  const worker = await mountWorker(main, { host: h })
  const res = (await worker.request('openspec.agents')) as { agents: string[]; defaultAgent: string }
  assert.equal(res.defaultAgent, 'gemini')
  assert.equal(res.agents[0], 'gemini')
  assert.equal(new Set(res.agents).size, res.agents.length)
  await worker.deactivate()
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('watchFolder calls onChange once per burst of writes', async () => {
  const root = fixture()
  let calls = 0
  const w = watchFolder(join(root, 'openspec'), () => calls++, () => {}, 100)
  const tasks = join(root, 'openspec/changes/add-auth/tasks.md')
  for (let i = 0; i < 5; i++) writeFileSync(tasks, `- [x] a\n- [ ] b${i}\n`)
  await wait(400)
  w.close()
  assert.equal(calls, 1)
})

test('open board creates the file once, lists it once in .gitignore and opens it', async () => {
  const root = fixture()
  writeFileSync(join(root, 'openspec/.gitignore'), 'tmp')
  const h = host(root, { agent: 'claude' }, { 'editor.open': { opened: true } })
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.openBoard')
  writeFileSync(join(root, 'openspec/board.openspec'), 'keep')
  await worker.request('openspec.openBoard')
  assert.equal(readFileSync(join(root, 'openspec/board.openspec'), 'utf8'), 'keep')
  assert.equal(readFileSync(join(root, 'openspec/.gitignore'), 'utf8'), 'tmp\nboard.openspec\n')
  assert.deepEqual(h.callsOf('editor.open')[0], { workspaceId: 'w1', path: 'openspec/board.openspec' })
  await worker.deactivate()
})

test('open board without OpenSpec creates nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-'))
  const h = host(root, { agent: 'claude' }, { 'editor.open': { opened: true } })
  const worker = await mountWorker(main, { host: h })
  const r = (await worker.request('openspec.openBoard')) as { opened: boolean }
  assert.equal(r.opened, false)
  assert.equal(existsSync(join(root, 'openspec')), false)
  assert.equal(h.callsOf('editor.open').length, 0)
  await worker.deactivate()
})

test('board reads refuse paths outside openspec/', async () => {
  const root = fixture()
  writeFileSync(join(root, 'secret.md'), 'secret')
  const h = host(root, { agent: 'claude' }, { 'editor.open': { opened: true } })
  const worker = await mountWorker(main, { host: h })
  const ok = (await worker.request('openspec.readFile', { path: 'specs/auth/spec.md' })) as { text: string }
  assert.equal(ok.text, '# auth')
  await assert.rejects(() => worker.request('openspec.readFile', { path: '../secret.md' }))
  await assert.rejects(() => worker.request('openspec.openFile', { path: '../secret.md' }))
  assert.equal(h.callsOf('editor.open').length, 0)
  await worker.deactivate()
})

test('promptFor request returns the command line', async () => {
  const worker = await mountWorker(main, { host: host(fixture()) })
  const r = (await worker.request('openspec.promptFor', { step: 'archive', change: 'x' })) as { prompt: string }
  assert.equal(r.prompt, '/openspec-archive-change x')
  await worker.deactivate()
})

test('a chosen model starts the CLI in a terminal, then types the command', async () => {
  const h = host(fixture())
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'apply', change: 'add-auth', agent: 'claude', model: 'opus' })
  assert.deepEqual(h.callsOf('terminal.create'), [{ workspaceId: 'w1', title: 'claude', command: 'claude --model opus' }])
  assert.equal(h.callsOf('agent.launch').length, 0)
  await main.whenDelivered()
  assert.deepEqual(h.callsOf('terminal.sendText'), [
    { terminalId: 't2', text: '/openspec-apply-change add-auth', enter: true }
  ])
  await worker.deactivate()
})

test('the default model setting applies and an unsafe model is refused', async () => {
  const h = host(fixture(), { agent: 'claude', model: 'sonnet', modelFlags: '{"claude":"-m {model}"}' })
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'verify', change: 'add-auth' })
  assert.deepEqual(h.callsOf('terminal.create')[0], { workspaceId: 'w1', title: 'claude', command: 'claude -m sonnet' })
  await assert.rejects(() => worker.request('openspec.launch', { step: 'apply', change: 'x', model: 'a; b' }))
  assert.equal(h.callsOf('terminal.create').length, 1)
  await worker.deactivate()
})

test('no model: agent.launch as before; a model that never gets ready types nothing', async () => {
  const h = host(fixture(), { agent: 'claude' }, { 'terminal.read': BUSY })
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'apply', change: 'x', model: 'opus' })
  await main.whenDelivered()
  assert.equal(h.callsOf('terminal.sendText').length, 0)
  await worker.deactivate()
})

test('stage choices: saved default beats the setting, which beats the global model', async () => {
  const h = host(fixture(), {
    agent: 'claude',
    model: 'haiku',
    stageDefaults: '{"propose":{"model":"opus"},"apply":{"model":"sonnet"}}'
  })
  const worker = await mountWorker(main, { host: h })
  assert.deepEqual(await worker.request('openspec.stageChoice', { step: 'propose' }), { agent: 'claude', ask: true, model: 'opus' })
  assert.deepEqual(await worker.request('openspec.stageChoice', { step: 'archive' }), { agent: 'claude', ask: true, model: 'haiku' })
  await worker.request('openspec.saveStageChoice', { step: 'apply', agent: 'codex', model: 'gpt-5' })
  assert.deepEqual(await worker.request('openspec.stageChoice', { step: 'apply' }), { agent: 'codex', ask: true, model: 'gpt-5' })
  assert.deepEqual(await worker.request('openspec.stageChoice', { step: 'propose' }), { agent: 'claude', ask: true, model: 'opus' })
  await assert.rejects(() => worker.request('openspec.saveStageChoice', { step: 'apply', agent: 'claude', model: 'a b' }))
  await worker.deactivate()
})

test('malformed stageDefaults is reported when the dialog asks', async () => {
  const worker = await mountWorker(main, { host: host(fixture(), { agent: 'claude', stageDefaults: 'nope' }) })
  await assert.rejects(() => worker.request('openspec.stageChoice', { step: 'apply' }))
  await worker.deactivate()
})

const CATALOG_JSON = {
  anthropic: { models: { a: { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' }, b: { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' } } },
  openai: { models: { c: { id: 'gpt-5', name: 'GPT-5' } } }
}

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch
  globalThis.fetch = impl
  main.resetCatalog()
  try {
    return await run()
  } finally {
    globalThis.fetch = real
    main.resetCatalog()
  }
}

test('models: catalog is fetched once, cached, searchable and capped', async () => {
  let calls = 0
  await withFetch(
    (async () => (calls++, { ok: true, json: async () => CATALOG_JSON })) as unknown as typeof fetch,
    async () => {
      const worker = await mountWorker(main, { host: host(fixture()) })
      const found = (await worker.request('openspec.models', { agent: 'claude', query: 'opus 4.1' })) as {
        items: { id: string }[]
        total: number
        catalog: string
      }
      assert.deepEqual(found.items.map((m) => m.id), ['claude-opus-4-1'])
      assert.equal(found.catalog, 'ready')
      const capped = (await worker.request('openspec.models', { agent: 'claude', limit: 2 })) as { items: unknown[]; total: number }
      assert.equal(capped.items.length, 2)
      assert.ok(capped.total > 2)
      assert.equal(calls, 1)
      await worker.deactivate()
    }
  )
})

test('models: offline falls back to the built-in suggestions and retries later', async () => {
  main.catalogOptions.retryMs = 0
  await withFetch((async () => { throw new Error('offline') }) as unknown as typeof fetch, async () => {
    const worker = await mountWorker(main, { host: host(fixture()) })
    const r = (await worker.request('openspec.models', { agent: 'claude' })) as { items: { id: string }[]; catalog: string }
    assert.equal(r.catalog, 'fallback')
    assert.ok(r.items.some((m) => m.id === 'opus'))
    await worker.deactivate()
  })
  main.catalogOptions.retryMs = 60_000
})

test('models: refreshModels reloads the catalog', async () => {
  let calls = 0
  await withFetch(
    (async () => (calls++, { ok: true, json: async () => CATALOG_JSON })) as unknown as typeof fetch,
    async () => {
      const worker = await mountWorker(main, { host: host(fixture()) })
      await worker.request('openspec.models', { agent: 'codex' })
      assert.deepEqual(await worker.request('openspec.refreshModels'), { catalog: 'ready' })
      assert.equal(calls, 2)
      await worker.deactivate()
    }
  )
})

test('an unknown prompt style is typed into once the screen stops changing', async () => {
  const h = host(fixture(), { agent: 'claude' }, { 'terminal.read': { lines: ['Welcome', 'ready when you are'], truncated: false } })
  const worker = await mountWorker(main, { host: h })
  await worker.request('openspec.launch', { step: 'apply', change: 'add-auth' })
  await main.whenDelivered()
  assert.equal(h.callsOf('terminal.sendText').length, 1)
  await worker.deactivate()
})
