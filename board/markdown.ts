// A small markdown renderer for OpenSpec files. `parse` is pure (unit-tested); `toDom` builds
// elements with createElement/textContent only, never innerHTML, so file content can't run as script.

export type Inline = { kind: 'text' | 'code' | 'bold'; text: string }
export type Block =
  | { type: 'heading'; level: number; inline: Inline[] }
  | { type: 'para'; inline: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: { inline: Inline[]; task?: boolean; done?: boolean }[] }
  | { type: 'rule' }

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/

export function parseInline(text: string): Inline[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part): Inline => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return { kind: 'code', text: part.slice(1, -1) }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 3) return { kind: 'bold', text: part.slice(2, -2) }
      return { kind: 'text', text: part }
    })
}

const LIST = /^\s*([-*+]|\d+[.)])\s+(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/

export function parse(text: string): Block[] {
  const lines = text.split(/\r?\n/)
  const blocks: Block[] = []
  let para: string[] = []
  const flush = (): void => {
    if (para.length) blocks.push({ type: 'para', inline: parseInline(para.join(' ')) })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i] ?? ''); i++) code.push(lines[i] ?? '')
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1]?.length ?? 1, inline: parseInline(heading[2] ?? '') })
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push({ type: 'rule' })
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      flush()
      blocks.push({ type: 'quote', inline: parseInline(quote[1] ?? '') })
      continue
    }
    const item = LIST.exec(line)
    if (item) {
      flush()
      const ordered = /\d/.test(item[1] ?? '')
      const last = blocks[blocks.length - 1]
      const list = last?.type === 'list' && last.ordered === ordered ? last : null
      const target = list ?? { type: 'list' as const, ordered, items: [] }
      const task = TASK.exec(item[2] ?? '')
      target.items.push(
        task
          ? { inline: parseInline(task[2] ?? ''), task: true, done: (task[1] ?? ' ') !== ' ' }
          : { inline: parseInline(item[2] ?? '') }
      )
      if (!list) blocks.push(target)
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    para.push(line.trim())
  }
  flush()
  return blocks
}

function inlineTo(parent: HTMLElement, inline: Inline[]): void {
  for (const part of inline) {
    if (part.kind === 'text') parent.append(document.createTextNode(part.text))
    else {
      const el = document.createElement(part.kind === 'code' ? 'code' : 'strong')
      el.textContent = part.text
      parent.append(el)
    }
  }
}

/** Renders blocks into `root` (replacing its content). */
export function toDom(root: HTMLElement, blocks: Block[]): void {
  root.replaceChildren()
  for (const b of blocks) {
    if (b.type === 'rule') root.append(document.createElement('hr'))
    else if (b.type === 'code') {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = b.text
      pre.append(code)
      root.append(pre)
    } else if (b.type === 'list') {
      const list = document.createElement(b.ordered ? 'ol' : 'ul')
      for (const it of b.items) {
        const li = document.createElement('li')
        if (it.task) {
          li.className = it.done ? 'task done' : 'task'
          const box = document.createElement('span')
          box.className = it.done ? 'chk on' : 'chk'
          box.textContent = it.done ? '✓' : ''
          box.setAttribute('role', 'img')
          box.setAttribute('aria-label', it.done ? 'done' : 'not done')
          li.append(box)
        }
        inlineTo(li, it.inline)
        list.append(li)
      }
      root.append(list)
    } else {
      const el = document.createElement(
        b.type === 'heading' ? `h${Math.min(b.level, 6)}` : b.type === 'quote' ? 'blockquote' : 'p'
      )
      if (b.type === 'heading') {
        const text = b.inline.map((p) => p.text).join('')
        if (/^Requirement:/.test(text)) el.className = 'requirement'
        else if (/^Scenario:/.test(text)) el.className = 'scenario-title'
      }
      inlineTo(el, b.inline)
      root.append(el)
    }
  }
}
