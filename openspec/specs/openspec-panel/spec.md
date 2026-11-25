# openspec-panel Specification

## Purpose
An Orca sidebar panel that shows the focused workspace's OpenSpec changes, task progress and specs, and launches agents for the OpenSpec propose, apply, verify and archive steps.

## Requirements

### Requirement: Show active changes with task progress
The panel SHALL list every active change under `openspec/changes/` of the focused local workspace (excluding `archive/`) on a "Changes" tab whose label carries the change count. Each change SHALL show its name, a status, a progress bar, and checked/total tasks counted from `- [x]` / `- [ ]` lines in its `tasks.md`. Status SHALL be "Planning" without `tasks.md`, "Not started" when none is checked, "In progress" when some are checked, and "Ready to archive" when all are checked. The tab SHALL offer a name filter and a Status dropdown (All, In progress, Done; Done = Ready to archive).

#### Scenario: Change with tasks
- **WHEN** `openspec/changes/add-auth/tasks.md` has 3 of 5 boxes checked
- **THEN** the panel shows `add-auth` with status "In progress" and progress `3/5`

#### Scenario: Change without tasks.md
- **WHEN** a change folder has no `tasks.md`
- **THEN** the panel shows it with status "Planning" and progress "no tasks"

#### Scenario: Filter by status
- **WHEN** the user picks "Done"
- **THEN** only changes with all tasks checked are listed

#### Scenario: Filter by name
- **WHEN** the user types `auth`
- **THEN** only changes whose name contains `auth` (case-insensitive) are listed, or "No matching changes" is shown

### Requirement: Show specs
The panel SHALL list capabilities found as `openspec/specs/**/spec.md`, including nested paths, on a "Specs" tab whose label carries the spec count, with a name filter. Nested capabilities SHALL show their full path.

#### Scenario: Specs listed
- **WHEN** the workspace has `openspec/specs/auth/spec.md` and `openspec/specs/billing/invoices/spec.md`
- **THEN** the Specs tab lists `auth` and `billing/invoices`

#### Scenario: Filter specs
- **WHEN** the user types `inv`
- **THEN** only `billing/invoices` is listed

### Requirement: Refresh
The panel SHALL reload when the focused workspace changes, when an agent launched by the plugin reaches `done`, when the user presses Refresh, and when files under the focused local workspace's `openspec/` folder change. File-change refreshes SHALL be debounced so a burst of edits causes one reload about 300 ms after the last edit. If the folder cannot be watched, the failure SHALL be logged and other triggers SHALL keep working.

#### Scenario: Workspace switch
- **WHEN** the user focuses another workspace
- **THEN** the panel shows that workspace's changes and specs

#### Scenario: Task ticked outside the plugin
- **WHEN** a `tasks.md` is saved with one more box checked
- **THEN** the panel shows the new progress without pressing Refresh

#### Scenario: Burst of edits
- **WHEN** several files under `openspec/` change within 300 ms
- **THEN** the panel reloads once

#### Scenario: Unwatchable workspace
- **WHEN** the workspace is remote, has no `openspec/`, or the watch fails
- **THEN** no watcher runs and the Refresh button still reloads the panel

### Requirement: Launch workflow actions
The plugin SHALL offer New change, Apply, Verify and Archive as palette commands (plus Refresh), and New change as a header button. The New change form SHALL take a description and an agent (claude, codex, gemini, opencode, cursor, copilot) and offer Explore and Propose. Selecting a change SHALL show Apply and Verify; once all its tasks are done, Archive SHALL replace Verify. Palette Apply, Verify and Archive SHALL use the selected change, or the only change if there is one. Each action SHALL launch the agent without a prompt, show its terminal, wait until the agent is ready for input, then type the command. Commands SHALL follow the Command style setting: `skill` (default) sends `/openspec-<step> <arg>` (for example `/openspec-apply-change <change>`), `opsx` sends `/opsx:<step> <arg>`. Propose SHALL first create a new worktree workspace (new branch) in the focused workspace's project and launch its agent there, leaving the focused workspace unchanged; every other action SHALL launch in the focused workspace.

#### Scenario: Propose a change
- **WHEN** the user enters "add dark mode", picks an agent and presses Propose
- **THEN** a new worktree workspace is created and shown, the agent's terminal opens in it, and `/openspec-propose add dark mode` is typed once the agent is ready

#### Scenario: Focused workspace untouched by Propose
- **WHEN** the user presses Propose
- **THEN** no terminal is created and no file is written in the previously focused workspace

#### Scenario: Worktree creation fails
- **WHEN** the new workspace cannot be created (for example the focused workspace is not in a Git project)
- **THEN** the plugin reports the error and starts no agent

#### Scenario: Apply selected change
- **WHEN** the user selects `add-auth` and presses Apply
- **THEN** `/openspec-apply-change add-auth` is sent to a new agent in the focused workspace

#### Scenario: Apply in the proposal's worktree
- **WHEN** the user switches to the workspace created by Propose and presses Apply on its change
- **THEN** the agent applies it in that worktree only

#### Scenario: Explore stays in place
- **WHEN** the user presses Explore
- **THEN** the agent starts in the focused workspace and no workspace is created

#### Scenario: Archive when done
- **WHEN** all tasks of the selected change are checked
- **THEN** Archive is offered instead of Verify

#### Scenario: OPSX style
- **WHEN** Command style is `opsx` and the user presses Apply on `add-auth`
- **THEN** `/opsx:apply add-auth` is sent

#### Scenario: Agent never becomes ready
- **WHEN** no input marker appears within the readiness timeout
- **THEN** the plugin reports the failure and does not type the command

### Requirement: Initialize OpenSpec
In a local workspace without OpenSpec content (`openspec/config.yaml`, `changes/` or `specs/`), the panel SHALL show a "not set up" state with an Init OpenSpec button that opens a terminal running `openspec init`.

#### Scenario: Workspace without openspec
- **WHEN** the focused workspace has no `openspec/` folder
- **THEN** the panel shows an Init OpenSpec button and pressing it runs `openspec init` in a terminal

### Requirement: Settings and unsupported workspaces
The plugin SHALL expose settings `agent` (default `claude`) and `commandStyle` (`skill` | `opsx`, default `skill`). Remote workspaces SHALL be reported as unsupported and never read.

#### Scenario: Remote workspace
- **WHEN** the focused workspace's host is not local
- **THEN** the panel shows a "remote workspaces not supported" message and reads no files
