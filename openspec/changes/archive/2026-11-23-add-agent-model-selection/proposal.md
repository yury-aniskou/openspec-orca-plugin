# Proposal

## Why

Every OpenSpec action starts an agent with `agent.launch`, which takes no model, so the agent CLI silently uses its own default. Users cannot pick which provider (agent CLI) and model run a step, nor change them per launch.

## What Changes

- Add a launch choice of provider (agent CLI) and model, offered in the sidebar panel and on the board, with remembered defaults.
- Start the agent through the CLI itself: open a terminal with the agent's command line including its model flag (for example `claude --model opus`), wait until it is ready, then send the OpenSpec command. `agent.launch` is used only when no model is chosen.
- Per-provider model flag templates and model suggestions, overridable in settings; a free-text model field for any other model.
- New settings: `model` (default model, empty = CLI default), `modelFlags` (JSON map provider to flag template), `extraArgs` (extra CLI arguments per provider).
- Out of scope: managing API keys, listing models from provider APIs, per-step defaults.

## Capabilities

### New Capabilities
- `agent-model-selection`: choosing provider and model for OpenSpec launches and starting the agent CLI with them.

### Modified Capabilities

## Impact

- `src/worker.ts` (launch path, `terminal.create`), `src/protocol.ts` (launch input gains `model`), `src/panel.tsx` and `board/main.ts` (pickers), `orca-plugin.json` (settings; changing settings changes the fingerprint, so the user re-approves).
- Capability `terminal:send` and `terminal:read` already granted; `terminal.create` needs the existing terminal capability (verify with `orca plugin validate`).
- Builds on `add-openspec-panel-plugin` and `add-openspec-board`.
