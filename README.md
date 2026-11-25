# OpenSpec for Orca

An [Orca](https://github.com/stablyai/orca) plugin for [OpenSpec](https://github.com/Fission-AI/OpenSpec): a sidebar panel with a workspace's changes and specs, and one-click agents for the OpenSpec steps.

## Features

- **Changes tab:** active changes from `openspec/changes/` (not `archive/`) with status (Planning, Not started, In progress, Ready to archive), progress bar and checked/total tasks. Name filter and status dropdown.
- **Specs tab:** every `openspec/specs/**/spec.md`, nested paths included, with a name filter.
- **Actions:** **+** opens the New change form (description, agent, Explore or Propose). Selecting a change shows Apply and Verify, or Archive once all tasks are done. **Propose creates a new worktree workspace** (new branch, named from the description) and runs there; switch to it to Apply, Verify or Archive that change. It is cut from the base branch, so uncommitted local files are not copied. Explore, Apply, Verify and Archive start an agent in the focused workspace; shows its terminal, waits until it is ready, then types the command.
- **Palette:** `OpenSpec: New change`, `Apply change`, `Verify change`, `Archive change`, `Refresh panel`.
- **Auto-refresh:** on workspace switch, when a launched agent finishes, via the Refresh button, and ~300 ms after files in `openspec/` change.
- **Init OpenSpec:** in a workspace without `openspec/`, a button runs `openspec init` in a terminal.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `agent` | `claude` | Agent CLI launched for OpenSpec commands |
| `commandStyle` | `skill` | `skill` sends `/openspec-apply-change <change>`; `opsx` sends `/opsx:apply <change>` |

## Requirements

- Orca 1.4.272 or newer
- The `openspec` CLI (for Init OpenSpec)
- An agent with the OpenSpec skills or slash commands installed

## Permissions

`workspace:read`, `workspace:write` (show agent terminals), `workspace:create` (Propose's worktree), `agent:read`, `agent:launch`, `terminal:send`, `terminal:read`, `notifications:show`, `storage:own`, `settings:own`.

## Limitations

Local workspaces only (remote/SSH are reported as unsupported). No stores or system-scope filter yet.

## Board

`OpenSpec: Open board` (or the layers button in the panel header) creates `openspec/board.openspec` (git-ignored) and opens it as a Kanban board in an editor tab: columns, cards with quick actions, change and spec detail pages with rendered markdown, and a confirm dialog for Archive. File access is limited to `.md` files under `openspec/`.

## Develop

No build step and no npm install; Orca loads the TypeScript directly.

```sh
orca plugin types .       # generate .orca/types
orca plugin test .
orca plugin check .
orca plugin dev watch .
```

Layout: `src/panel.tsx` (UI, state in atoms, only calls `plugin.request`), `src/worker.ts` (filesystem, watching, agent launching), `src/protocol.ts` (message contract), `src/openspec.ts` and `src/view.ts` (pure logic).

## Provider and model

The agent CLI and model are chosen only in the dialog that opens when you press a stage button (or "Run with" on the board); the panel shows no pickers otherwise. The last choice is remembered. With a model, the plugin starts the CLI itself (for example `claude --model opus`), waits until it is ready, then sends the OpenSpec command. Without one it launches the agent as before. Settings: `model` (default), `modelFlags` (JSON per agent, e.g. `{"codex": "-m {model}"}`) and `extraArgs` (JSON per agent). Model names may contain only letters, digits and `. _ : / -`.

## Choose per stage

Every stage action (Explore, Propose, Apply, Verify, Archive) opens a dialog with the agent and model; nothing starts until you press the stage button. The fields are prefilled from that stage's default, then the "Run with" choice, then the `model`/`agent` settings. "Save as default" stores the shown choice for that stage. You can also set defaults in the `stageDefaults` setting:

```json
{"propose": {"agent": "claude", "model": "opus"}, "apply": {"model": "sonnet"}, "archive": {"model": "haiku"}}
```

A saved default wins over the setting. Changing the manifest needs re-approval: `orca plugin dev load . --approve <fingerprint>`, then `orca plugin dev reload .`.

### Launch without asking

Press **Don't ask again** in the launch dialog, or open the panel's **Stages** tab: set agent, model and "Launch directly" for each stage. The stage then starts immediately. Switch it back to "Ask each time" in the Stages tab. In `stageDefaults` this is `"ask": false`.

## Model catalog

The model field is a search box over every model of the providers the agent uses, loaded from [models.dev](https://models.dev) (claude: Anthropic, codex: OpenAI, gemini: Google, opencode: all providers as `provider/model`, cursor and copilot: Anthropic, OpenAI and Google plus their own aliases). Type to filter (all words must match the id or name); press a result to pick it. Text that matches nothing is used as is. The list is cached for 24 hours; "Refresh models" reloads it. Offline, only the built-in suggestions are listed and the picker says so.
