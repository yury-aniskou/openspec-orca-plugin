# Tasks

## 1. Command builder

- [x] 1.1 `src/agent.ts`: default flag templates, model suggestions, `validateModel`, `buildAgentCommand`
- [x] 1.2 `src/agent.test.ts`: templates, override, extra args, unsafe model refused

## 2. Worker and protocol

- [x] 2.1 `src/protocol.ts`: `model` in `openspec.launch`; suggested models in `openspec.agents`
- [x] 2.2 `src/worker.ts`: with a model use `terminal.create`, focus, `waitReady`, `sendText`; without one keep `agent.launch`
- [x] 2.3 Read settings `model`, `modelFlags`, `extraArgs`; store and return the last launch choice
- [x] 2.4 `src/worker.test.ts`: claude with model, no model, unsafe model, template override, not-ready timeout

## 3. Manifest

- [x] 3.1 `orca-plugin.json`: settings `model`, `modelFlags`, `extraArgs`; bump version

## 4. UI

- [x] 4.1 `src/panel.tsx`: provider and model pickers, remembered choice, sent with launches; panel tests
- [x] 4.2 `board/main.ts`: same pickers in the header, used by card, detail and form launches

## 5. Verify and document

- [x] 5.1 Run `orca plugin validate .`, `orca plugin test .`, `orca plugin check .`
- [ ] 5.2 Manual check: user re-approves, launches with `claude` and a model, sees the model in the terminal
- [x] 5.3 Update `README.md` (model and provider, settings)
