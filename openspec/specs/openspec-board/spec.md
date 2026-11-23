# openspec-board Specification

## Purpose
A Kanban board shown in a main-area editor tab that lets users browse OpenSpec changes and specs, read their files, and start agents for workflow steps.

## Requirements

### Requirement: Open a board tab
The plugin SHALL offer `OpenSpec: Open board` as a palette command and a board button in the panel header. It SHALL work only for a focused local workspace that has OpenSpec set up; otherwise it SHALL notify the user to set up OpenSpec first and create nothing. Opening SHALL create `openspec/board.openspec` if missing, add `board.openspec` to `openspec/.gitignore` once, and open that file in a main-area editor tab.

#### Scenario: Open the board
- **WHEN** the focused workspace has `openspec/` and the user runs "OpenSpec: Open board"
- **THEN** `openspec/board.openspec` exists, `openspec/.gitignore` lists it once, and the board opens in an editor tab

#### Scenario: Workspace without OpenSpec
- **WHEN** the focused workspace has no OpenSpec content
- **THEN** a notification says to set up OpenSpec first and no file is created

#### Scenario: Existing board file is kept
- **WHEN** `openspec/board.openspec` already exists
- **THEN** it is not overwritten

### Requirement: Kanban columns
The board SHALL show changes in five columns: Planning, Not started, In progress, Ready to archive (using the panel's status rules) and Archived. The Archived column SHALL list `openspec/changes/archive/` newest first, start collapsed, and load cards 40 at a time as it scrolls.

#### Scenario: Cards in status columns
- **WHEN** changes are at 0/6, 6/8 and 9/9 tasks and one has no tasks.md
- **THEN** they appear under Not started, In progress, Ready to archive and Planning

#### Scenario: Archived column
- **WHEN** there are 100 archived changes
- **THEN** the column count shows 100, and expanding it shows the newest 40, with more loaded on scroll

### Requirement: Change cards
Each card SHALL show the change name, a progress bar with done/total, the first sentence of the proposal's Why section when present, the date (`created` from `.openspec.yaml`, or an archived folder's date prefix), and the first unchecked task when one exists. Hovering an active card SHALL show quick actions that launch agents as the panel does: Apply on Planning and Not started, Apply and Verify on In progress, Archive on Ready to archive. Archived cards SHALL have none.

#### Scenario: Card summary
- **WHEN** a proposal's Why starts "Employees cannot print their LDNA. PETRU has an API."
- **THEN** the card shows "Employees cannot print their LDNA."

#### Scenario: Quick actions by column
- **WHEN** the user hovers a Ready to archive card
- **THEN** only Archive is shown, and an In progress card shows Apply and Verify

### Requirement: Board header and live updates
The board header SHALL show the workspace name, a filter matching change names and summaries, and New change, Specs and Refresh controls. The board SHALL update when the worker posts new state without redrawing unchanged content, and SHALL follow Orca's light and dark themes.

#### Scenario: Live update
- **WHEN** a task is ticked in a change's tasks.md
- **THEN** the card's progress updates and it moves column if its status changed

#### Scenario: Filter
- **WHEN** the user types a word that appears only in one change's summary
- **THEN** only that change's card is shown

### Requirement: Change detail page
Clicking a card SHALL open the change's detail page showing its name, status, progress, created date and the specs it has deltas for. File tabs SHALL be grouped as Docs (`proposal.md`, `design.md`, `tasks.md`, each only if present), Other (other markdown in the change folder) and Spec deltas (one per `specs/<capability>/spec.md`), with `proposal.md` selected first. The selected file SHALL be rendered as markdown with its path under `openspec/` and an Edit action that opens it in an editor tab; `tasks.md` SHALL show a read-only checklist. A side column SHALL list related changes (active or archived) with deltas for the same specs, each opening its detail page. Active changes SHALL offer Apply, Verify, Explore, Open in editor and Archive; archived changes only Open in editor. Back button, breadcrumb, header title and Esc SHALL return to the board keeping filter and scroll position.

#### Scenario: Open a change
- **WHEN** the user clicks `add-dark-mode`, which has proposal.md, tasks.md, `agent/notes.md` and a delta for `ui-theme`
- **THEN** tabs proposal.md, tasks.md (Docs), notes.md (Other) and ui-theme (Spec deltas) are shown with proposal.md rendered

#### Scenario: Edit a file
- **WHEN** the user presses Edit on the design.md tab
- **THEN** `openspec/changes/<change>/design.md` opens in a main-area editor tab

#### Scenario: Archived change
- **WHEN** the user opens an archived change
- **THEN** no Apply, Verify, Explore or Archive action is shown

#### Scenario: Back with Esc
- **WHEN** the detail page is open, no dialog is open, and the user presses Esc
- **THEN** the board is shown again

#### Scenario: Explore action
- **WHEN** the user presses Explore on a change in the `skill` command style
- **THEN** `/openspec-explore <change>` is sent to a new agent with no dialog

### Requirement: Safe markdown rendering
File content SHALL be rendered as text nodes and structural markup only; content from a file SHALL never execute as script or be inserted as raw HTML.

#### Scenario: Script in a file
- **WHEN** a proposal.md contains `<script>alert(1)</script>`
- **THEN** the text is shown literally and nothing runs

### Requirement: Specs drawer and spec detail
The Specs button SHALL open a drawer listing specs with a filter, loading 40 at a time on scroll. Selecting a spec SHALL open its detail page with the rendered `spec.md`, an Edit action, and a "Changed by" list of changes (active and archived) carrying a delta for it, each opening its detail page.

#### Scenario: Changes that touched a spec
- **WHEN** the user opens `ui-theme`, which the active `add-dark-mode` and one archived change have deltas for
- **THEN** both appear under "Changed by"

### Requirement: Confirm archive on the board
Archive on the board, from a card or the detail page, SHALL first show a dialog naming the change and the command it will send. Only its confirm button SHALL launch the agent; Cancel, an outside click or Esc SHALL launch nothing. When tasks are unfinished the dialog SHALL say how many. Apply, Verify and Explore on the board SHALL launch without a dialog.

#### Scenario: Cancel archive
- **WHEN** the user presses Archive then Cancel
- **THEN** no agent starts

#### Scenario: Unfinished tasks warning
- **WHEN** the user presses Archive on a change at 11/12 tasks
- **THEN** the dialog says 1 of 12 tasks is not done

#### Scenario: Apply does not ask
- **WHEN** the user presses Apply on the detail page
- **THEN** an agent starts at once with `/openspec-apply-change <change>`

### Requirement: Board file access stays inside OpenSpec
Reading or opening a file from the board SHALL be allowed only for `.md` files inside the focused workspace's `openspec/` folder. Paths that resolve outside it, through `..` or a symlink, or that are not markdown SHALL be refused with an error, and nothing SHALL be read or opened.

#### Scenario: Path outside OpenSpec
- **WHEN** the board asks to read `changes/../../src/worker.ts`
- **THEN** the request fails with an error and no file is read

#### Scenario: Symlink escape
- **WHEN** a markdown file under `openspec/` is a symlink to a file outside it
- **THEN** reading it is refused
