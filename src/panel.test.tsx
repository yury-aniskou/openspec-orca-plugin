import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import type { OpenSpecState } from './protocol'

const ok: OpenSpecState = {
  status: 'ok',
  workspace: 'demo',
  changes: [
    { name: 'add-auth', done: 3, total: 5 },
    { name: 'billing-export', done: 4, total: 4 },
    { name: 'plan-only', done: 0, total: null }
  ],
  specs: ['auth', 'billing/invoices']
}

test('lists changes with status and progress, and counts on tabs', async () => {
  const view = await mount(panel, { host: mockHost({ requests: { 'openspec.state': ok } }) })
  assert.ok(view.find({ label: 'add-auth' }))
  assert.ok(view.find({ text: /In progress · 3\/5/ }))
  assert.ok(view.find({ text: /Planning · no tasks/ }))
  assert.ok(view.find({ text: 'Changes (3)' }))
  assert.ok(view.find({ text: 'Specs (2)' }))
  await view.unmount()
})

test('name filter narrows changes', async () => {
  const view = await mount(panel, { host: mockHost({ requests: { 'openspec.state': ok } }) })
  await view.type({ label: 'Filter changes' }, 'zzz')
  assert.ok(view.find({ text: 'No matching changes.' }))
  await view.unmount()
})

test('selecting a finished change offers Archive instead of Verify and launches it', async () => {
  const launches: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.stageChoice': { agent: 'claude', model: '', ask: true },
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'billing-export' })
  assert.equal(view.find({ text: 'Verify' }), null)
  await view.press({ text: 'Archive' })
  assert.deepEqual(launches, [])
  await view.press({ text: 'Launch' })
  assert.deepEqual(launches, [{ step: 'archive', change: 'billing-export', agent: 'claude', model: '' }])
  await view.unmount()
})

test('selecting an unfinished change offers Apply and Verify', async () => {
  const view = await mount(panel, { host: mockHost({ requests: { 'openspec.state': ok } }) })
  await view.press({ label: 'add-auth' })
  assert.ok(view.find({ text: 'Apply' }))
  assert.ok(view.find({ text: 'Verify' }))
  assert.equal(view.find({ text: 'Archive' }), null)
  await view.unmount()
})

test('specs tab lists nested paths and filters them', async () => {
  const view = await mount(panel, { host: mockHost({ requests: { 'openspec.state': ok } }) })
  await view.select({ label: 'OpenSpec views' }, 'specs')
  assert.ok(view.find({ label: 'billing/invoices' }))
  await view.type({ label: 'Filter specs' }, 'inv')
  assert.equal(view.find({ label: 'auth' }), null)
  assert.ok(view.find({ label: 'billing/invoices' }))
  await view.unmount()
})

test('not set up: Init OpenSpec runs openspec init', async () => {
  let inits = 0
  const host = mockHost({
    requests: {
      'openspec.state': { status: 'no-openspec', workspace: 'demo', changes: [], specs: [] },
      'openspec.init': () => (inits++, { terminalId: 't2' })
    }
  })
  const view = await mount(panel, { host })
  assert.ok(view.find({ label: 'OpenSpec is not set up' }))
  await view.press({ text: 'Init OpenSpec' })
  assert.equal(inits, 1)
  await view.unmount()
})

test('remote workspace shows the unsupported message', async () => {
  const host = mockHost({
    requests: { 'openspec.state': { status: 'remote', workspace: 'demo', changes: [], specs: [] } }
  })
  const view = await mount(panel, { host })
  assert.ok(view.find({ text: /Remote workspaces are not supported/ }))
  await view.unmount()
})

test('New change form launches propose with the description and agent', async () => {
  const launches: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.agents': { agents: ['claude', 'codex'], defaultAgent: 'claude', models: { claude: ['opus', 'sonnet'] } },
      'openspec.stageChoice': { agent: 'claude', model: '', ask: true },
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'New change' })
  await view.type({ label: 'Describe the change' }, 'add dark mode')
  await view.press({ text: 'Propose' })
  await view.press({ text: 'Launch' })
  assert.deepEqual(launches, [{ step: 'propose', description: 'add dark mode', agent: 'claude', model: '' }])
  await view.unmount()
})

test('the board button asks the worker to open the board', async () => {
  let opened = 0
  const host = mockHost({
    requests: { 'openspec.state': ok, 'openspec.openBoard': () => (opened++, { opened: true }) }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'Open board' })
  assert.equal(opened, 1)
  await view.unmount()
})

test('the dialog shows the stage default, sends the chosen model and can save it', async () => {
  const launches: unknown[] = []
  const saved: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.agents': { agents: ['claude', 'codex'], defaultAgent: 'claude', models: { claude: ['opus', 'sonnet'] } },
      'openspec.models': { items: [], total: 0, catalog: 'ready' },
      'openspec.stageChoice': { agent: 'claude', model: 'sonnet', ask: true },
      'openspec.saveStageChoice': (input) => (saved.push(input), { saved: true }),
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'billing-export' })
  await view.press({ text: 'Archive' })
  await view.type({ label: 'Model' }, '-x')
  await view.press({ text: 'Save as default' })
  assert.deepEqual(saved, [{ step: 'archive', agent: 'claude', model: 'sonnet-x' }])
  await view.press({ text: 'Launch' })
  assert.deepEqual(launches, [{ step: 'archive', change: 'billing-export', agent: 'claude', model: 'sonnet-x' }])
  await view.unmount()
})

test('cancelling the dialog launches nothing', async () => {
  const launches: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.stageChoice': { agent: 'claude', model: '', ask: true },
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'add-auth' })
  await view.press({ text: 'Apply' })
  await view.press({ text: 'Cancel' })
  assert.deepEqual(launches, [])
  assert.equal(view.find({ text: 'Launch' }), null)
  await view.unmount()
})

test('typing in Model searches the catalog and picking a result sets the model', async () => {
  const launches: unknown[] = []
  const queries: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.agents': { agents: ['claude'], defaultAgent: 'claude', models: {} },
      'openspec.models': (input) => {
        queries.push(input)
        return { items: [{ id: 'claude-opus-4-1', name: 'Claude Opus 4.1' }], total: 3, catalog: 'ready' }
      },
      'openspec.stageChoice': { agent: 'claude', model: '', ask: true },
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'billing-export' })
  await view.press({ text: 'Archive' })
  await view.type({ label: 'Model' }, 'opus')
  assert.deepEqual(queries.at(-1), { agent: 'claude', query: 'opus', limit: 8 })
  assert.ok(view.find({ text: /2 more/ }))
  await view.press({ label: 'claude-opus-4-1' })
  await view.press({ text: 'Launch' })
  assert.deepEqual(launches, [{ step: 'archive', change: 'billing-export', agent: 'claude', model: 'claude-opus-4-1' }])
  await view.unmount()
})

test('a typed model that matches nothing is still launched; fallback is announced', async () => {
  const launches: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.agents': { agents: ['claude'], defaultAgent: 'claude', models: {} },
      'openspec.models': { items: [], total: 0, catalog: 'fallback' },
      'openspec.stageChoice': { agent: 'claude', model: '', ask: true },
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'billing-export' })
  await view.press({ text: 'Archive' })
  await view.type({ label: 'Model' }, 'my-model')
  assert.ok(view.find({ text: /not available/ }))
  await view.press({ text: 'Launch' })
  assert.deepEqual(launches, [{ step: 'archive', change: 'billing-export', agent: 'claude', model: 'my-model' }])
  await view.unmount()
})

test('a stage set to launch directly skips the dialog; the Stages tab saves it', async () => {
  const launches: unknown[] = []
  const saved: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.stageChoice': (input) =>
        (input as { step: string }).step === 'archive'
          ? { agent: 'claude', model: 'haiku', ask: false }
          : { agent: 'claude', model: '', ask: true },
      'openspec.saveStageChoice': (input) => (saved.push(input), { saved: true }),
      'openspec.launch': (input) => (launches.push(input), { terminalId: 't1' })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'billing-export' })
  await view.press({ text: 'Archive' })
  assert.deepEqual(launches, [{ step: 'archive', change: 'billing-export', agent: 'claude', model: 'haiku' }])
  assert.equal(view.find({ text: 'Launch' }), null)
  await view.select({ label: 'OpenSpec views' }, 'stages')
  await view.select({ label: 'Stage' }, 'apply')
  await view.type({ label: 'Stage Model' }, 'sonnet')
  await view.select({ label: 'Launch' }, 'direct')
  await view.press({ text: 'Save apply' })
  assert.deepEqual(saved, [{ step: 'apply', agent: 'claude', model: 'sonnet', ask: false }])
  await view.unmount()
})

test('pressing a spec opens it on the board', async () => {
  const opened: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.openSpecOnBoard': (input) => (opened.push(input), { opened: true })
    }
  })
  const view = await mount(panel, { host })
  await view.select({ label: 'OpenSpec views' }, 'specs')
  const name = (ok as { specs: string[] }).specs[0]
  await view.press({ label: name })
  assert.deepEqual(opened, [{ spec: name }])
  await view.unmount()
})

test('pressing a change shows it on the board', async () => {
  const opened: unknown[] = []
  const host = mockHost({
    requests: {
      'openspec.state': ok,
      'openspec.openChangeOnBoard': (input) => (opened.push(input), { opened: true })
    }
  })
  const view = await mount(panel, { host })
  await view.press({ label: 'billing-export' })
  assert.deepEqual(opened, [{ change: 'billing-export' }])
  await view.unmount()
})
