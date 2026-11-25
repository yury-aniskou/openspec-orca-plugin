## MODIFIED Requirements

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
