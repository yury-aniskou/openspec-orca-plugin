## 1. Worker and protocol

- [x] 1.1 Add `stageDefaults` setting to `orca-plugin.json`; bump version
- [x] 1.2 Add stage choice parsing/resolution (`stageChoices` storage, then setting) with validation and tests
- [x] 1.3 Add `openspec.stageChoice` and `openspec.saveStageChoice` requests to `src/protocol.ts` and `src/worker.ts`

## 2. Panel

- [x] 2.1 Launch dialog (agent select, model select/custom, "Save as default for this stage", Cancel/Launch)
- [x] 2.2 Route all stage buttons and the New change form through the dialog
- [x] 2.3 Panel tests: confirm launches with chosen model, cancel creates no terminal, default is prefilled

## 3. Board

- [x] 3.1 Launch dialog with the same fields and prefill
- [x] 3.2 Route card actions and detail-page actions through it

## 4. Docs and verification

- [x] 4.1 Update README (stage defaults, `stageDefaults` example)
- [x] 4.2 Run `orca plugin test .`, `validate`, `check`
- [ ] 4.3 Manual check in Orca after re-approving the fingerprint
