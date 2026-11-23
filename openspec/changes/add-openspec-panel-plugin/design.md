# Design

## Context

The repo contains only OpenSpec scaffolding. Orca plugins are TypeScript/TSX loaded directly by Orca (no build, no npm deps), declared by `orca-plugin.json`. Plugin API details come from `orca skills get orca-plugin-authoring` and the generated `.orca/types`; verify them before implementing rather than copying from memory.

## Goals / Non-Goals

**Goals:**
- Working MVP equivalent to the reference's sidebar panel and agent launching.
- Layout that leaves room for later improvements (new protocol messages, new panels/editors).
- Testable with `orca plugin test .` and `orca plugin check .`.

**Non-Goals:**
- Kanban board, OpenSpec stores, system-prefix scope, remote workspaces, our own improvements (later changes).
- Copying the reference code verbatim; write our own implementation, keeping Apache-2.0 attribution if any code is reused.

## Decisions

- **Panel/worker split.** `src/panel.tsx` is a components panel with state in atoms that only calls `plugin.request`; `src/worker.ts` (`trusted-worker`) does fs access, watching and agent launching. Rationale: panels cannot touch the filesystem or launch agents.
- **Typed protocol in `src/protocol.ts`.** All request/event names and payloads declared once by augmenting the `orca` module; add messages there first.
- **Pure parsing in `src/openspec.ts`.** Node `fs` only; counts only `- [x]`/`- [X]` as done (matches OpenSpec CLI), skips `archive/`, finds nested `specs/**/spec.md`. Classification lives in `src/view.ts` so a future board can reuse it.
- **Refresh in the worker.** `workspace.changed`, `agent.status.changed` (done, for plugin-launched terminals), Refresh button, and a debounced (300 ms) recursive `fs.watch` in `src/watch.ts`; one module-level watcher, retarget skipped when path unchanged, closed in `deactivate()`.
- **Agent launch without `prompt`.** Passing `prompt` to `agent.launch` yields an orphaned terminal. Instead: launch, `terminal.focus`, poll `terminal.read` until an input marker (`❯`, `>`, `›`) on a stable screen, then `terminal.sendText`. Timings injectable for tests. Requires Orca ≥ 1.4.259.
- **Command style setting.** Prompts come from one `promptFor()`; `skill` default because bare `/opsx:*` commands don't exist on a default install.
- **UI state persistence.** Panel-only state (tab, filters) uses `persist: 'plugin'`; only values the worker reads (selected change) use `'storage'`, avoiding the controlled-input echo bug.
- **Capabilities minimal:** `workspace:read/write`, `agent:read/launch`, `terminal:send/read`, `storage:own`, `settings:own`. Adding any later forces user re-approval.

## Risks / Trade-offs

- Plugin API may differ from the reference's version → read typings first; set `engines.orca` ≥ newest `Since` used.
- Agent readiness detection by screen markers is heuristic → timeout, report failure, never type blindly.
- Write requests act on the focused workspace, which can move → test writes with unit tests on temp dirs, not live CLI requests.
- Panel test kit quirks (timers, `Select` empty value) → use `view.settled()` and non-empty option values.
