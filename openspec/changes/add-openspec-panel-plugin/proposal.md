# Proposal

## Why

This repository has no plugin code yet. We want our own Orca plugin for OpenSpec that we can extend with our own improvements.

## What Changes

- Add an Orca plugin (manifest `orca-plugin.json`, worker, components panel) that adds an **OpenSpec** panel to the right sidebar.
- Panel shows the focused local workspace's active changes (status, task progress) and specs, with filters.
- Panel and palette commands launch an agent in the workspace to run OpenSpec steps: New change (explore/propose), Apply, Verify, Archive.
- Settings: agent CLI and command style (skill vs. OPSX).
- Auto-refresh on workspace change, agent completion, manual Refresh, and debounced `openspec/` file changes.
- "Init OpenSpec" button for workspaces without `openspec/`.
- Unit tests for parsing, view logic, worker and panel.
- Out of scope (later changes): Kanban board, OpenSpec stores, system-prefix scope filter, remote/SSH workspaces, our own improvements.

## Capabilities

### New Capabilities
- `openspec-panel`: Sidebar panel listing a workspace's changes and specs, refreshing automatically, and launching agents for OpenSpec workflow steps.

### Modified Capabilities

## Impact

- New files at repo root: `orca-plugin.json`, `src/` (worker, panel, protocol, openspec parsing, view, watch, tests), `tsconfig.json`, `assets/`.
- Requires Orca ≥ 1.4.259 (`terminal.focus`) and the `openspec` CLI; no build step or npm dependencies.
- Capabilities requested: `workspace:read`, `workspace:write`, `agent:read`, `agent:launch`, `terminal:send`, `terminal:read`, `storage:own`, `settings:own`.