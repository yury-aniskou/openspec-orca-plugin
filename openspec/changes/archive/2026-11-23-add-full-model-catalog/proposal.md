# Proposal

## Why

The model picker offers a short hand-written list per agent, so most models cannot be found without typing the exact name. Users want every model and a way to search them.

## What Changes

- The worker loads the public models.dev catalog (`https://models.dev/api.json`) and builds a model list per agent from the providers that agent can use (claude: anthropic; codex: openai; gemini: google; opencode: every provider as `provider/model`; cursor and copilot: their own static lists plus the catalog's anthropic/openai/google models).
- The catalog is cached in plugin storage for 24 hours and refreshed in the background; a "Refresh models" action forces a reload. On any failure the built-in suggestions are used and the picker says so.
- The model picker in the panel and on the board becomes a searchable list: typing filters models by id or name, a click picks one, and any typed text can still be used as a custom model.
- Model ids are still validated before a terminal is created.

## Capabilities

### New Capabilities
- `model-catalog`: full, cached, searchable model lists per agent with offline fallback.

### Modified Capabilities

## Impact

- `src/agent.ts` (catalog parsing and per-agent mapping), `src/worker.ts` (fetch, cache, `openspec.agents`/`openspec.refreshModels`), `src/protocol.ts`.
- `src/panel.tsx` and `board/main.ts`: searchable picker replaces the Select.
- Network access to models.dev from the worker; the manifest may need to declare it, which changes the approval fingerprint.
- `README.md`.
