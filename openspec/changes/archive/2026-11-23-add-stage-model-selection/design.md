# Design

## Context

Launching goes through `launchChoice` and `launchVisible` in `src/worker.ts`; the choice comes from the request, storage (`launchAgent`, `launchModel`), then settings. The panel and board each call `openspec.launch` directly on click. Model validation and command building live in `src/agent.ts`.

## Goals / Non-Goals

**Goals:**
- One dialog component per surface (panel, board), same behaviour.
- Per-stage defaults that survive restarts and can also be set in settings.

**Non-Goals:**
- Fetching model lists from providers.
- Different command styles per stage.

## Decisions

- **Resolution order in the worker**: request value, stage default (storage `stageChoices`), setting `stageDefaults`, global storage choice, setting `agent`/`model`. The dialog always sends explicit values, so the order matters only for prefill; `openspec.stageChoice { step }` returns the resolved pair for the dialog.
- **Stage defaults storage**: storage key `stageChoices` as `{ [step]: { agent, model } }`, written by `openspec.saveStageChoice`. Alternative, writing to settings, is not possible from the worker. The `stageDefaults` setting is read-only fallback for manual editing.
- **Dialog replaces direct launch**: all buttons open the dialog; panel uses the components Dialog, board reuses its existing dialog code. The global pickers stay as the fallback and are not removed.
- **Validation** stays in `agentCommand`/`validateModel`; `stageDefaults` is parsed with a strict shape check and ignored per stage if invalid, with an error only when it is used.

## Risks / Trade-offs

- [One extra click per launch] → Enter confirms; defaults prefill everything.
- [Dialog API in the panel kit unverified] → check with `orca plugin test`; fall back to an inline confirm form.
- [New setting changes the approval fingerprint] → user re-approves.
