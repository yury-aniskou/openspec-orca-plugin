# Design

## Context

`SUGGESTED_MODELS` in `src/agent.ts` is static and returned by `openspec.agents`. The panel uses a Select with a Custom option; the board uses a select plus input. models.dev serves one JSON document (~300 providers, `{provider: {models: {id: {id, name, ...}}}}`); the OpenRouter provider alone has ~380 models, so lists reach hundreds of entries.

## Goals / Non-Goals

**Goals:**
- All models of the relevant providers, searchable, with offline fallback.
- No new dependencies; plain `fetch` in the trusted worker.

**Non-Goals:**
- Checking that the installed CLI actually accepts a model (ids from the catalog may differ from a CLI's aliases).
- Showing prices or capabilities.

## Decisions

- **models.dev over per-CLI listing**: one source for every agent; CLI listing exists only for some. Alternative: `opencode models` where available — left for later.
- **Mapping lives in `src/agent.ts`** as a pure function `modelsFor(agent, catalog)` so it is unit-tested with a fixture: claude→anthropic, codex→openai, gemini→google, opencode→all providers (prefixed), cursor/copilot→anthropic+openai+google merged with their static suggestions. Static suggestions stay first so aliases like `opus` or `auto` remain available.
- **Slimmed cache**: store only `{ provider: [[id, name]] }` for providers that are used, with `fetchedAt`, in plugin storage; refresh when older than 24 h, in the background so opening the panel never waits.
- **Request shape**: `openspec.agents` returns `models` (current best list) and `catalog: 'ready' | 'loading' | 'fallback'`; new `openspec.refreshModels` forces a reload and returns the same shape.
- **Searchable picker**: panel uses an Input plus a List of filtered matches (capped at 50 shown, with a "N more, keep typing" line); board uses an input with a custom dropdown list (not the native datalist, which renders detached). Filter logic is a shared pure function `filterModels(list, query)` in `src/view.ts`, tokens ANDed.
- **Timeouts**: fetch aborts after 10 s; failure keeps the old cache if any.

## Risks / Trade-offs

- [Catalog ids differ from CLI names] → static aliases first; custom text always allowed; validation unchanged.
- [Huge list slows rendering] → cap rendered rows.
- [Network permission may be required by Orca] → check at validate time; if needed declare it and re-approve.
- [models.dev unavailable or changes shape] → defensive parsing, fallback to suggestions.
