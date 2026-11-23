import { assert, test } from 'orca/testing'
import { parse } from './markdown'

test('parses headings, lists, tasks, code and inline marks', () => {
  const blocks = parse('# T\n\nHello **bold** `x`\nmore\n\n- [x] done\n- [ ] todo\n- plain\n\n```\n<b>\n```\n')
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'para', 'list', 'code'])
  const para = blocks[1]
  assert.ok(para?.type === 'para')
  assert.deepEqual(para.inline.map((p) => p.kind), ['text', 'bold', 'text', 'code', 'text'])
  const list = blocks[2]
  assert.ok(list?.type === 'list')
  assert.deepEqual(list.items.map((i) => [i.task ?? false, i.done ?? false]), [[true, true], [true, false], [false, false]])
})

test('markup in a file stays literal text', () => {
  const blocks = parse('<script>alert(1)</script>\n\n```\n<img onerror=x>\n```')
  const para = blocks[0]
  assert.ok(para?.type === 'para')
  assert.equal(para.inline[0]?.text, '<script>alert(1)</script>')
  assert.deepEqual(blocks[1], { type: 'code', text: '<img onerror=x>' })
})

test('ordered and unordered lists stay separate; unterminated fence ends at EOF', () => {
  const blocks = parse('1. a\n2. b\n\n- c\n\n```\nopen')
  assert.deepEqual(blocks.map((b) => b.type), ['list', 'list', 'code'])
})
