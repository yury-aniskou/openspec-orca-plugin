import { assert, test } from 'orca/testing'
import { filterByName, isReady, matchesChip, progressText, statusOf } from './view'

const none = { name: 'a', done: 0, total: null }
const fresh = { name: 'b', done: 0, total: 5 }
const partial = { name: 'c', done: 3, total: 5 }
const full = { name: 'd', done: 4, total: 4 }

test('status by task progress', () => {
  assert.equal(statusOf(none), 'Planning')
  assert.equal(statusOf(fresh), 'Not started')
  assert.equal(statusOf(partial), 'In progress')
  assert.equal(statusOf(full), 'Ready to archive')
  assert.equal(isReady(full), true)
  assert.equal(isReady(partial), false)
})

test('progress text', () => {
  assert.equal(progressText(none), 'no tasks')
  assert.equal(progressText(partial), '3/5')
})

test('status chips', () => {
  const all = [none, fresh, partial, full]
  assert.deepEqual(all.filter((c) => matchesChip(c, 'active')), [partial])
  assert.deepEqual(all.filter((c) => matchesChip(c, 'done')), [full])
  assert.equal(all.filter((c) => matchesChip(c, 'all')).length, 4)
})

test('name filter is case-insensitive', () => {
  assert.deepEqual(filterByName(['auth', 'billing/invoices'], ' INV ', (s) => s), ['billing/invoices'])
  assert.deepEqual(filterByName(['auth'], '', (s) => s), ['auth'])
})
