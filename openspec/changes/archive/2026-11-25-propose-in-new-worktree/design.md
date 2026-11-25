## Context

The worker launches every stage via `launchVisible` in the focused workspace (`focused()` → `terminal.create`/`agent.launch`). Orca's host API (1.8+) offers `workspace.create` (`projectId`, `name`, `baseBranch`, `open`, `setup`), which makes a branch and worktree. `workspace.list` rows carry `projectId`.

## Goals / Non-Goals

**Goals:**
- Propose runs only in a fresh worktree; Apply/Verify/Archive are run by the user from that workspace.

**Non-Goals:**
- Auto-running Apply in a different worktree, copying uncommitted files, merging/cleaning up worktrees, a setting to opt out.

## Decisions

- **Propose-only creation.** The change does not exist until Propose finishes, so the worktree is created at Propose; later stages reuse the focused workspace, which is the new one after the user switches. Alternative (new worktree at Apply) rejected: planning would pollute the current branch.
- **`workspace.create` without `agent`, `open: true`**, then `launchVisible` in the returned `workspaceId`. This keeps model/command-style handling (`terminal.create` with the built command) identical to other stages.
- **Name** from the description: lowercase kebab slug, max ~40 chars, fallback `openspec-change`; Orca resolves collisions.
- **Base branch** left to Orca's default for the project.
- **Failures** (no `projectId`, remote workspace, host error) surface as the existing invalid-request error before any terminal is made.

## Risks / Trade-offs

- Worktree is cut from the base branch, so uncommitted local OpenSpec edits are not visible there. Accepted; documented in README.
- `workspace.create` setup hooks may be slow; the readiness wait already runs in the background.
- Requires host API 1.8; engines `orca >=1.4.259` must be checked to include it, else bump.
