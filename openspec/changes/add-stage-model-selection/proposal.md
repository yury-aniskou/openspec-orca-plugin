# Proposal

## Why

Agent and model are chosen once and reused for every OpenSpec step. Steps need different models (a strong one for propose, a cheaper one for apply or archive), and a click on an action launches immediately, so the model cannot be changed first.

## What Changes

- Every stage action (explore, propose, apply, verify, archive) opens a launch dialog in the panel and on the board. Nothing starts until the user confirms.
- The dialog shows the agent and model for that stage, prefilled from the stage's default, and lets the user change them for this run.
- Per-stage defaults: the dialog can save the shown choice as the default for that stage. A new setting `stageDefaults` (JSON, `{"apply": {"agent": "claude", "model": "sonnet"}}`) provides the same defaults in the settings UI.
- The global "Run with" pickers become the fallback for stages without a default.

## Capabilities

### New Capabilities
- `stage-model-selection`: confirm-before-launch dialog and per-stage agent/model defaults.

### Modified Capabilities

## Impact

- `src/worker.ts`: choice resolution per step, new requests to read and save stage defaults.
- `src/protocol.ts`, `src/panel.tsx`, `board/main.ts`: launch dialog and default editing.
- `orca-plugin.json`: new setting `stageDefaults` (changes the approval fingerprint).
- `README.md`.
