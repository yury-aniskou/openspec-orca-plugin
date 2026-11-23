// Watches a folder recursively and calls onChange once per burst of file events.
import { watch, type FSWatcher } from 'node:fs'

export type FolderWatch = { path: string; close(): void }

export function watchFolder(
  path: string,
  onChange: () => void,
  onError: (err: Error) => void,
  delayMs = 300
): FolderWatch {
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  const watcher: FSWatcher = watch(path, { recursive: true }, () => {
    if (closed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!closed) onChange()
    }, delayMs)
  })
  const close = (): void => {
    if (closed) return
    closed = true
    if (timer) clearTimeout(timer)
    watcher.close()
  }
  watcher.on('error', (err) => {
    close()
    onError(err)
  })
  return { path, close }
}
