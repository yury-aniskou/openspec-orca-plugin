# Proposal

## Why

The sidebar panel is narrow: it shows status and progress but not what a change is about. A full-size Kanban board with readable proposals, designs, tasks and spec deltas lets users review and steer OpenSpec work without leaving Orca.

## What Changes

- Add a custom editor for `*.openspec` files, backed by `openspec/board.openspec`, that renders a Kanban board in a main-area editor tab.
- Add the palette command `OpenSpec: Open board` and a board button in the panel header.
- Board: columns Planning, Not started, In progress, Ready to archive, Archived (lazy, 40 at a time); cards with progress, proposal summary, date and next task; hover quick actions; change filter.
- Change detail page: file tabs (docs, other, spec deltas) with safely rendered markdown, Edit action, related changes, Apply/Verify/Explore/Archive actions.
- Spec drawer and spec detail page with the changes that touched each spec.
- Archive confirmation dialog on the board.
- New worker requests for archived changes, change files, spec info, reading and opening files, with file access restricted to `openspec/`.
- Out of scope: OpenSpec stores and the system-prefix scope, remote workspaces, Claude model picker.

## Capabilities

### New Capabilities
- `openspec-board`: Kanban board, change and spec detail pages, and archive confirmation in a main-area editor tab, plus the commands that open it.

### Modified Capabilities

## Impact

- New: `board/main.ts`, `board/markdown.ts` (+ test); extend `src/openspec.ts`, `src/protocol.ts`, `src/worker.ts`, `src/panel.tsx` and their tests.
- `orca-plugin.json`: new command `openspec.openBoard`, `customEditors` entry (`frame: "isolated"`), version bump. Changing commands or editors changes the approval fingerprint, so the user must re-approve the plugin.
- Requires `workspace:write` (already granted) for `editor.open`.
- Depends on the `add-openspec-panel-plugin` change (panel, worker, protocol) being applied first.
