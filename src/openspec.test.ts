import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import {
  changeFiles,
  changesTouching,
  countTasks,
  hasOpenSpec,
  nextTask,
  proposalSummary,
  readArchived,
  readChanges,
  readSpecs,
  resolveInside
} from './openspec'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'openspec-'))
  const w = (rel: string, text: string): void => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  w('openspec/changes/add-auth/tasks.md', '- [x] a\n- [ X ] b\n- [x] c\n- [ ] d\n- [~] e\n')
  w('openspec/changes/no-tasks/proposal.md', '# p')
  w('openspec/changes/add-auth/proposal.md', '## Why\n\nUsers cannot log in. We need auth.\n\n## What\n')
  w('openspec/changes/add-auth/.openspec.yaml', 'schema: x\ncreated: 2026-03-04\n')
  w('openspec/changes/add-auth/specs/auth/spec.md', '# d')
  w('openspec/changes/add-auth/agent/notes.md', '# n')
  w('openspec/changes/archive/2026-01-02-old/proposal.md', '# p')
  w('openspec/changes/archive/2026-01-02-old/specs/auth/spec.md', '# d')
  w('openspec/changes/archive/2025-12-01-older/tasks.md', '- [x] a')
  w('openspec/specs/auth/spec.md', '# auth')
  w('openspec/specs/billing/invoices/spec.md', '# inv')
  return root
}

test('counts task boxes: only x is done', () => {
  assert.deepEqual(countTasks('- [x] a\r\n- [ x] b\n- [ ] c\n- [-] d\n- []\nplain'), { done: 2, total: 5 })
})

test('reads changes (skipping archive) and nested specs', () => {
  const root = fixture()
  assert.deepEqual(readChanges(root), [
    { name: 'add-auth', done: 3, total: 5, next: 'd', summary: 'Users cannot log in.', created: '2026-03-04' },
    { name: 'no-tasks', done: 0, total: null }
  ])
  assert.deepEqual(readSpecs(root), ['auth', 'billing/invoices'])
})

test('hasOpenSpec needs a config, changes/ or specs/', () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-'))
  assert.equal(hasOpenSpec(root), false)
  mkdirSync(join(root, 'openspec'))
  writeFileSync(join(root, 'openspec', '.gitignore'), 'x')
  assert.equal(hasOpenSpec(root), false)
  mkdirSync(join(root, 'openspec', 'specs'))
  assert.equal(hasOpenSpec(root), true)
})

test('next task and proposal summary', () => {
  assert.equal(nextTask('- [x] a\n- [ ] 1.2 do it\n- [ ] z'), '1.2 do it')
  assert.equal(nextTask('- [x] a'), undefined)
  assert.equal(proposalSummary('# P\n## Why\nEmployees cannot print their LDNA. PETRU has an API.\n'), 'Employees cannot print their LDNA.')
  assert.equal(proposalSummary('# P\n## What\nx'), undefined)
  assert.ok((proposalSummary(`## Why\n${'a'.repeat(300)}`) ?? '').length <= 160)
})

test('archived changes: newest first, paged, filtered, dated', () => {
  const root = fixture()
  const all = readArchived(root, 0, 40)
  assert.deepEqual(all.items.map((c) => c.name), ['2026-01-02-old', '2025-12-01-older'])
  assert.equal(all.items[0]?.created, '2026-01-02')
  assert.equal(readArchived(root, 1, 1).items[0]?.name, '2025-12-01-older')
  assert.equal(readArchived(root, 0, 40, 'OLDER').total, 1)
})

test('change files are grouped and related changes found', () => {
  const root = fixture()
  const { files, specs } = changeFiles(root, 'add-auth', false)
  assert.deepEqual(
    files.map((f) => `${f.group}:${f.label}`),
    ['docs:proposal.md', 'docs:tasks.md', 'other:notes.md', 'delta:auth']
  )
  assert.deepEqual(specs, ['auth'])
  assert.deepEqual(changesTouching(root, specs, { name: 'add-auth', archived: false }), [
    { name: '2026-01-02-old', archived: true }
  ])
  assert.throws(() => changeFiles(root, '../x', false))
})

test('resolveInside refuses paths outside openspec/ markdown', () => {
  const root = fixture()
  writeFileSync(join(root, 'secret.md'), 'secret')
  writeFileSync(join(root, 'openspec', 'notes.txt'), 'x')
  symlinkSync(join(root, 'secret.md'), join(root, 'openspec', 'link.md'))
  assert.ok(resolveInside(root, 'changes/add-auth/proposal.md').endsWith('proposal.md'))
  assert.throws(() => resolveInside(root, 'changes/../../secret.md'))
  assert.throws(() => resolveInside(root, 'link.md'))
  assert.throws(() => resolveInside(root, 'notes.txt'))
  assert.throws(() => resolveInside(root, join(root, 'secret.md')))
})
