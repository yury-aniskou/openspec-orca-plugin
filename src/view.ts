// Derived view state for the panel: pure functions, unit-tested in view.test.ts.
import type { ChangeInfo } from './protocol'

export type Status = 'Planning' | 'Not started' | 'In progress' | 'Ready to archive'
export type Chip = 'all' | 'active' | 'done'

export function statusOf(c: ChangeInfo): Status {
  if (c.total === null) return 'Planning'
  if (c.total > 0 && c.done >= c.total) return 'Ready to archive'
  if (c.done === 0) return 'Not started'
  return 'In progress'
}

export function isReady(c: ChangeInfo): boolean {
  return statusOf(c) === 'Ready to archive'
}

export function matchesChip(c: ChangeInfo, chip: Chip): boolean {
  if (chip === 'active') return statusOf(c) === 'In progress'
  if (chip === 'done') return isReady(c)
  return true
}

export function filterByName<T>(items: readonly T[], text: string, name: (item: T) => string): T[] {
  const needle = text.trim().toLowerCase()
  return needle ? items.filter((i) => name(i).toLowerCase().includes(needle)) : [...items]
}

export function progressText(c: ChangeInfo): string {
  return c.total === null ? 'no tasks' : `${c.done}/${c.total}`
}
