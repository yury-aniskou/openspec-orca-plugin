import { assert, test } from 'orca/testing'
import { buildAgentCommand, filterModels, modelsFor, parseCliModels, slimCatalog, parseStageChoices, parseStringMap, validateModel } from './agent'

test('builds the CLI command with the model flag', () => {
  assert.equal(buildAgentCommand('claude', 'opus'), 'claude --model opus')
  assert.equal(buildAgentCommand('cursor', 'auto'), 'cursor-agent --model auto')
  assert.equal(buildAgentCommand('claude', ''), 'claude')
})

test('templates and extra args can be overridden', () => {
  assert.equal(buildAgentCommand('codex', 'gpt-5', { codex: '-m {model}' }, { codex: '--full-auto' }), 'codex -m gpt-5 --full-auto')
})

test('unsafe models and arguments are refused', () => {
  assert.throws(() => validateModel('opus; rm -rf ~'))
  assert.throws(() => buildAgentCommand('claude', '$(x)'))
  assert.throws(() => buildAgentCommand('claude', 'opus', {}, { claude: '&& ls' }))
  assert.throws(() => buildAgentCommand('nope', 'x'))
})

test('settings maps tolerate bad JSON', () => {
  assert.deepEqual(parseStringMap('{"a":"b","c":1}'), { a: 'b' })
  assert.deepEqual(parseStringMap('nope'), {})
  assert.deepEqual(parseStringMap('[1]'), {})
})

test('stage choices parse from JSON text or an object', () => {
  assert.deepEqual(parseStageChoices('{"apply":{"agent":"claude","model":"sonnet"},"bogus":{"model":"x"},"verify":5}'), {
    apply: { agent: 'claude', model: 'sonnet' }
  })
  assert.deepEqual(parseStageChoices({ archive: { model: ' haiku ' } }), { archive: { model: 'haiku' } })
  assert.deepEqual(parseStageChoices(''), {})
  assert.throws(() => parseStageChoices('nope'))
})

const CATALOG = slimCatalog({
  anthropic: { models: { a: { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }, b: { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' } } },
  openai: { models: { c: { id: 'gpt-5', name: 'GPT-5' }, d: { id: 'gpt-4o', name: 'GPT-4o' } } },
  broken: { models: 5 },
  other: null
})

test('catalog is slimmed and broken entries are skipped', () => {
  assert.deepEqual(Object.keys(CATALOG), ['anthropic', 'openai'])
  assert.deepEqual(CATALOG.openai, [['gpt-5', 'GPT-5'], ['gpt-4o', 'GPT-4o']])
  assert.deepEqual(slimCatalog('nope'), {})
})

test('models per agent: suggestions first, then the catalog providers, no duplicates', () => {
  const claude = modelsFor('claude', CATALOG).map((m) => m.id)
  assert.deepEqual(claude.slice(0, 2), ['opus', 'sonnet'])
  assert.ok(claude.includes('claude-opus-4-1'))
  assert.equal(claude.includes('gpt-5'), false)
  assert.equal(claude.filter((id) => id === 'claude-sonnet-4-5').length, 1)
  const open = modelsFor('opencode', CATALOG).map((m) => m.id)
  assert.ok(open.includes('openai/gpt-4o'))
  assert.deepEqual(modelsFor('claude', null).map((m) => m.id), modelsFor('claude', {}).map((m) => m.id))
})

test('filter matches every word in id or name, ignoring case', () => {
  const all = modelsFor('claude', CATALOG)
  assert.deepEqual(filterModels(all, 'son 4').map((m) => m.id), ['claude-sonnet-4-5'])
  assert.deepEqual(filterModels(all, 'OPUS 4.1').map((m) => m.id), ['claude-opus-4-1'])
  assert.equal(filterModels(all, 'zzz').length, 0)
  assert.equal(filterModels(all, '').length, all.length)
})

test('CLI listings are parsed; cursor uses exactly its CLI list', () => {
  const cli = parseCliModels('\u001b[1mAvailable models\u001b[0m\n\nauto - Auto (default)\ncomposer-2.5 - Composer 2.5 (current)\nopenai/gpt-5\n')
  assert.deepEqual(cli.map((m) => m.id), ['Available', 'auto', 'composer-2.5', 'openai/gpt-5'].filter((id) => id !== 'Available'))
  assert.equal(cli[1].name, 'Composer 2.5 (current)')
  assert.deepEqual(modelsFor('cursor', CATALOG, cli).map((m) => m.id), ['auto', 'composer-2.5', 'openai/gpt-5'])
  assert.ok(modelsFor('opencode', CATALOG, cli).some((m) => m.id === 'openai/gpt-5'))
})
