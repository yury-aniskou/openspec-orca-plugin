## 1. Catalog

- [x] 1.1 `src/agent.ts`: parse the models.dev document defensively and `modelsFor(agent, catalog)` with the provider mapping; unit tests with a fixture
- [x] 1.2 `src/view.ts`: `filterModels(list, query)` (case-insensitive, all tokens, id or name); unit tests
- [x] 1.3 `src/worker.ts`: fetch with 10 s timeout, slim 24 h cache in storage, background refresh, fallback to suggestions; tests with a stubbed fetch (fresh cache, stale cache, failure)
- [x] 1.4 `src/protocol.ts` and worker: `openspec.agents` returns `catalog` status; add `openspec.refreshModels`
- [x] 1.5 Check whether the manifest must declare network access; update `orca-plugin.json` if so

## 2. Panel

- [x] 2.1 Searchable model picker (Input + filtered List, capped rows, custom text, fallback notice) used by the global picker and the launch dialog
- [x] 2.2 Panel tests: filter narrows the list, pick sets the model, custom text accepted

## 3. Board

- [x] 3.1 Searchable dropdown replacing the select in `modelControl` for the dialog and "Run with"; keyboard: arrows, Enter, Escape
- [x] 3.2 "Refresh models" action and fallback notice

## 4. Docs and verification

- [x] 4.1 README: model catalog, caching, offline behaviour
- [x] 4.2 Run `orca plugin test .`, `validate`, `check`
- [ ] 4.3 Manual check in Orca: search finds a model, offline shows the fallback
