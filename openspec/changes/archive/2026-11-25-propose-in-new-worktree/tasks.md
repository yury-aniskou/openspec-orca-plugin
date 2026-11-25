## 1. Worker

- [x] 1.1 Add a pure `worktreeName(description)` slug helper in `src/openspec.ts` with unit tests (empty, long, non-ASCII input)
- [x] 1.2 In `launch` (`src/worker.ts`), for step `propose`: resolve the focused workspace's `projectId` via `workspace.list`, call `workspace.create` (`open: true`), then run `launchVisible` in the returned workspace; other steps unchanged
- [x] 1.3 Throw a clear invalid-request error when `projectId` is missing or creation fails, before creating any terminal
- [x] 1.4 Confirm the `engines.orca` minimum supports `workspace.create`; bump `orca-plugin.json` if not

## 2. Tests

- [x] 2.1 `src/worker.test.ts`: propose creates a workspace and launches in it, not in the focused one
- [x] 2.2 `src/worker.test.ts`: creation failure launches nothing; explore/apply/verify/archive still use the focused workspace
- [x] 2.3 Run `orca plugin test .` and `orca plugin check .`

## 3. Docs

- [x] 3.1 Update README Actions text: Propose opens a new worktree; run Apply from it

## 4. Hide pickers until a stage starts

- [x] 4.1 Remove the always-visible agent/model picker from the panel; show it only in the stage launch dialog
- [x] 4.2 Update README and the agent-model-selection spec delta
