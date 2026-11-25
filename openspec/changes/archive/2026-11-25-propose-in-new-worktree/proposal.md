## Why

Propose currently runs in the focused workspace, so the new change's artifacts and later code land on whatever branch is open. Each change should live on its own branch and worktree, so planning and implementation stay together and do not mix with other work.

## What Changes

- Propose (from the New change form, palette, or stage dialog) creates a new Orca workspace (new branch and worktree) in the focused workspace's project, shows it, and starts the agent there. The focused workspace is left untouched.
- The proposal and its artifacts are written only in the new worktree. Apply, Verify and Archive keep running in the focused workspace, so the user runs them from the new workspace, where the change exists.
- Explore keeps running in the focused workspace.
- The worktree name is derived from the description (slug). If creation fails, nothing is launched and the error is shown.

## Capabilities

### New Capabilities

### Modified Capabilities
- `openspec-panel`: Propose launches in a newly created worktree workspace instead of the focused one.
- `agent-model-selection`: provider and model fields appear only in the stage launch dialog, not permanently in the panel.

## Impact

- `src/worker.ts`: launch flow for `propose` (`workspace.create`, then the existing terminal launch in the new workspace).
- `src/protocol.ts`, `src/panel.tsx`: surface the created workspace / error to the panel if needed.
- Tests in `src/worker.test.ts`; README (Actions section).
- Uses the existing `workspace:write` capability; no new permissions expected.
