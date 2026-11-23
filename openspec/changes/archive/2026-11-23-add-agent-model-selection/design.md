# Design

## Context

`agent.launch` accepts only `workspaceId` and `agent`, so a model can only be set through the CLI's own flags. `terminal.create` accepts a `command`, which the existing `openspec.init` already uses. The worker already has `waitReady` and `isAgentReady` for typing a prompt once an agent is ready.

## Goals / Non-Goals

**Goals:** choose provider and model per launch in the panel and board; start the CLI with the model flag; safe handling of the model text.
**Non-Goals:** API keys, fetching model lists from providers, per-step defaults.

## Decisions

- **Provider = agent CLI kind** (existing `AGENTS` list). A separate provider concept (for example OpenRouter) is deferred; `extraArgs` covers custom setups.
- **Command line builder** `buildAgentCommand(agent, model, flags, extra)` in a pure module `src/agent.ts`, unit-tested. Default templates: `claude --model {model}`, `codex --model {model}`, `gemini --model {model}`, `opencode --model {model}`, `cursor`/`copilot --model {model}`; verify each against its CLI before release.
- **Launch path:** with a model, `terminal.create` (command) then `terminal.focus`, `waitReady`, `terminal.sendText`; without one, the existing `agent.launch` path, unchanged. Both reuse the readiness check and the "do not type on timeout" rule.
- **Quoting:** only `[A-Za-z0-9._:/-]` is accepted for the model, so no shell escaping is needed; anything else throws before `terminal.create`.
- **Settings:** `model` (string), `modelFlags` (JSON object, parse errors fall back to defaults), `extraArgs` (JSON object provider to string, same validation).
- **UI:** panel New change form and a compact picker in the panel header; on the board the same two controls in the header. Choice stored in plugin storage (`launchChoice`) and sent with every `openspec.launch`.
- **Protocol:** `openspec.launch` input gains `model`; `openspec.agents` also returns suggested models per provider.

## Risks / Trade-offs

- CLI flags differ and change between versions → templates are overridable and documented.
- Typing into a terminal that started a slow CLI → keep the existing ready/stable-screen check and timeout.
- Manifest settings change the approval fingerprint → user must re-approve.
