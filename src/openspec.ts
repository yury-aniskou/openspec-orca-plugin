// Reads an openspec/ folder from disk. Pure Node, no Orca APIs, so it is unit-tested directly.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, sep } from 'node:path'
import type { ChangeFileInfo, ChangeInfo, SpecUseInfo } from './protocol'

const DONE = /^\s*[-*]\s+\[\s*[xX]\s*\]/
const BOX = /^\s*[-*]\s+\[[^\]]*\]/

/** Counts checked/total task boxes; a box holding only x (any case) is done. */
export function countTasks(text: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const line of text.split(/\r?\n/)) {
    if (!BOX.test(line)) continue
    total++
    if (DONE.test(line)) done++
  }
  return { done, total }
}

function dirs(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

/** OpenSpec is set up when openspec/ holds a config, changes/ or specs/. */
export function hasOpenSpec(root: string): boolean {
  const dir = join(root, 'openspec')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false
  return ['config.yaml', 'config.yml', 'changes', 'specs'].some((name) => existsSync(join(dir, name)))
}

/** The text of the first unchecked task, without its box. */
export function nextTask(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    if (BOX.test(line) && !DONE.test(line)) {
      const task = line.replace(BOX, '').trim()
      if (task) return task
    }
  }
  return undefined
}

/** First sentence of the proposal's Why section, at most 160 characters. */
export function proposalSummary(text: string): string | undefined {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^#{1,6}\s+why\b/i.test(l))
  if (start < 0) return undefined
  const para: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break
    if (!line.trim()) {
      if (para.length) break
      continue
    }
    para.push(line.trim())
  }
  const flat = para.join(' ').replace(/[`*_]/g, '')
  if (!flat) return undefined
  const sentence = /^.+?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat
  return sentence.length > 160 ? `${sentence.slice(0, 159).trimEnd()}…` : sentence
}

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-/

function readCreated(dir: string): string | undefined {
  const file = join(dir, '.openspec.yaml')
  if (!existsSync(file)) return undefined
  const m = /^created:\s*['"]?(\d{4}-\d{2}-\d{2})/m.exec(readFileSync(file, 'utf8'))
  return m?.[1]
}

function readText(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

export function readChange(dir: string, name: string): ChangeInfo {
  const tasks = readText(join(dir, 'tasks.md'))
  const info: ChangeInfo = { name, done: 0, total: null }
  if (tasks !== undefined) {
    Object.assign(info, countTasks(tasks))
    const next = nextTask(tasks)
    if (next) info.next = next
  }
  const proposal = readText(join(dir, 'proposal.md'))
  const summary = proposal === undefined ? undefined : proposalSummary(proposal)
  if (summary) info.summary = summary
  const created = readCreated(dir) ?? DATE_PREFIX.exec(name)?.[1]
  if (created) info.created = created
  return info
}

/** Active changes (everything under openspec/changes/ except archive/). */
export function readChanges(root: string): ChangeInfo[] {
  const base = join(root, 'openspec', 'changes')
  if (!existsSync(base)) return []
  return dirs(base)
    .filter((name) => name !== 'archive')
    .map((name) => readChange(join(base, name), name))
}

/** Capability paths with a spec.md, including nested ones such as `billing/invoices`. */
export function readSpecs(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return
    for (const name of dirs(dir)) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (existsSync(join(dir, name, 'spec.md'))) out.push(rel)
      walk(join(dir, name), rel)
    }
  }
  walk(join(root, 'openspec', 'specs'), '')
  return out
}

const changesDir = (root: string) => join(root, 'openspec', 'changes')

/** Archived changes, newest first (folders are date-prefixed). `filter` matches name and summary. */
export function readArchived(
  root: string,
  offset: number,
  limit: number,
  filter = ''
): { total: number; items: ChangeInfo[] } {
  const base = join(changesDir(root), 'archive')
  if (!existsSync(base)) return { total: 0, items: [] }
  const needle = filter.trim().toLowerCase()
  const names = dirs(base).reverse()
  const matches = needle
    ? names.map((n) => readChange(join(base, n), n)).filter((c) => `${c.name} ${c.summary ?? ''}`.toLowerCase().includes(needle))
    : null
  if (matches) return { total: matches.length, items: matches.slice(offset, offset + limit) }
  return {
    total: names.length,
    items: names.slice(offset, offset + limit).map((n) => readChange(join(base, n), n))
  }
}

function markdownIn(dir: string, rel: string, out: string[]): void {
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (next !== 'specs') markdownIn(dir, next, out)
    } else if (e.isFile() && e.name.endsWith('.md')) out.push(next)
  }
}

function deltaSpecs(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string): void => {
    const base = join(dir, 'specs', rel)
    if (!existsSync(base)) return
    for (const name of dirs(base)) {
      const next = rel ? `${rel}/${name}` : name
      if (existsSync(join(dir, 'specs', next, 'spec.md'))) out.push(next)
      walk(next)
    }
  }
  walk('')
  return out
}

const DOCS = ['proposal.md', 'design.md', 'tasks.md']

/** Path of a change folder relative to openspec/. */
export const changePath = (change: string, archived: boolean): string =>
  archived ? `changes/archive/${change}` : `changes/${change}`

function checkName(name: string): void {
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error(`Invalid name: ${name}`)
}

export function changeFiles(root: string, change: string, archived: boolean): { files: ChangeFileInfo[]; specs: string[] } {
  checkName(change)
  const rel = changePath(change, archived)
  const dir = join(root, 'openspec', rel)
  if (!existsSync(dir)) throw new Error(`No such change: ${change}`)
  const files: ChangeFileInfo[] = []
  for (const doc of DOCS) {
    if (existsSync(join(dir, doc))) files.push({ path: `${rel}/${doc}`, label: doc, group: 'docs' })
  }
  const other: string[] = []
  markdownIn(dir, '', other)
  for (const f of other.sort()) {
    if (DOCS.includes(f)) continue
    files.push({ path: `${rel}/${f}`, label: f.split('/').pop() ?? f, group: 'other' })
  }
  const specs = deltaSpecs(dir)
  for (const spec of specs) files.push({ path: `${rel}/specs/${spec}/spec.md`, label: spec, group: 'delta' })
  return { files, specs }
}

/** Active and archived changes with a delta for any of `specs`, except `except`. */
export function changesTouching(root: string, specs: readonly string[], except?: SpecUseInfo): SpecUseInfo[] {
  if (!specs.length) return []
  const out: SpecUseInfo[] = []
  const scan = (base: string, archived: boolean): void => {
    if (!existsSync(base)) return
    for (const name of dirs(base)) {
      if (!archived && name === 'archive') continue
      if (except && except.name === name && except.archived === archived) continue
      if (deltaSpecs(join(base, name)).some((s) => specs.includes(s))) out.push({ name, archived })
    }
  }
  scan(changesDir(root), false)
  scan(join(changesDir(root), 'archive'), true)
  return out
}

/** Resolves a markdown path relative to openspec/ and refuses anything outside it, through `..` or a symlink. */
export function resolveInside(root: string, rel: string): string {
  if (typeof rel !== 'string' || !rel || isAbsolute(rel) || !rel.toLowerCase().endsWith('.md')) {
    throw new Error('Only markdown files under openspec/ can be read.')
  }
  const base = realpathSync(join(root, 'openspec'))
  const real = realpathSync(join(base, rel))
  if (!real.startsWith(base + sep) || !statSync(real).isFile()) {
    throw new Error('Path is outside the openspec/ folder.')
  }
  return real
}

/** Specs' spec.md path, relative to openspec/; throws for a missing spec. */
export function specPath(root: string, spec: string): string {
  if (!readSpecs(root).includes(spec)) throw new Error(`No such spec: ${spec}`)
  return `specs/${spec}/spec.md`
}
