# Tasks

## 1. Data layer

- [x] 1.1 Extend `ChangeInfo` in `src/protocol.ts` with optional `next`, `summary`, `created`; add `ArchivedInfo`, `ChangeFileInfo`, `SpecUseInfo` types
- [x] 1.2 `src/openspec.ts`: `nextTask`, `proposalSummary` (first sentence of Why, max 160 chars), `created` from `.openspec.yaml`; fill them in `readChange`
- [x] 1.3 `src/openspec.ts`: `readArchived` (newest first, paged, filter), `changeFiles` (docs/other/delta groups, touched specs), `specIndex`
- [x] 1.4 `src/openspec.ts`: `resolveInside` allowing only `.md` under `openspec/` after realpath
- [x] 1.5 Tests in `src/openspec.test.ts` for the new readers and path refusal (`..`, symlink, non-markdown)

## 2. Worker

- [x] 2.1 Declare requests in `src/protocol.ts`: `openspec.openBoard`, `openspec.promptFor`, `openspec.archived`, `openspec.changeFiles`, `openspec.specInfo`, `openspec.readFile`, `openspec.openFile`
- [x] 2.2 `ensureBoardFile` (`wx`, gitignore once) and `openBoard()` using `editor.open`, with notification when OpenSpec is not set up
- [x] 2.3 Handlers for the read-only requests, all guarded by `resolveInside` and local-workspace checks
- [x] 2.4 Palette command `openspec.openBoard`; tests in `src/worker.test.ts` (create/keep board file, gitignore once, no file when not set up, path refusal)

## 3. Manifest and panel

- [x] 3.1 `orca-plugin.json`: command `openspec.openBoard`, `customEditors` entry for `.openspec` (`frame: "isolated"`), bump version, check `engines.orca`
- [x] 3.2 `src/panel.tsx`: board button in the header calling `openspec.openBoard`; panel test

## 4. Board UI

- [x] 4.1 `board/markdown.ts` text-node markdown renderer with tests (script text stays literal, checkboxes read-only)
- [x] 4.2 `board/main.ts`: header (workspace, filter, New change, Specs, Refresh), columns, cards, quick actions, lazy Archived column
- [x] 4.3 Change detail page: header, file tabs, rendered file, Edit, related changes, actions, back/breadcrumb/Esc
- [x] 4.4 Specs drawer and spec detail page with "Changed by"
- [x] 4.5 Archive confirmation dialog (command shown, unfinished-task warning, Cancel/outside click/Esc)
- [x] 4.6 Live updates without redrawing unchanged DOM; light/dark theme via CSS variables

## 5. Verify and document

- [x] 5.1 Run `orca plugin validate .`, `orca plugin test .`, `orca plugin check .`
- [ ] 5.2 Manual check: user re-approves the fingerprint, opens the board, tests card actions, detail pages, archive dialog
- [x] 5.3 Update `README.md` (board section, limitations)
