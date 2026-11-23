# Tasks

## 1. Plugin scaffold

- [x] 1.1 Read `orca skills get orca-plugin-authoring` (manifest, host-api) and note the minimum `engines.orca`
- [x] 1.2 Create `orca-plugin.json` (id, panel `openspec`, commands propose/apply/verify/archive/refresh, events `workspace.changed` and `agent.status.changed`, settings `agent` and `commandStyle`, capabilities)
- [x] 1.3 Add `tsconfig.json`, `.gitignore` (`.orca/`), icon in `assets/`, and run `orca plugin types .`
- [x] 1.4 Run `orca plugin validate .`

## 2. OpenSpec reading

- [x] 2.1 `src/openspec.ts`: list active changes with checked/total tasks (skip `archive/`), list nested specs, `hasOpenSpec()`
- [x] 2.2 `src/view.ts`: status classification, name and status filters, counts
- [x] 2.3 `src/openspec.test.ts` and `src/view.test.ts` covering the spec scenarios

## 3. Worker

- [x] 3.1 `src/protocol.ts`: declare requests/events (list, refresh, launch actions, init, select change)
- [x] 3.2 `src/worker.ts`: resolve focused workspace path, report remote workspaces as unsupported, answer list requests
- [x] 3.3 `src/watch.ts`: debounced (300 ms) recursive watcher with single module-level instance, logging on failure, closed in `deactivate()`
- [x] 3.4 Refresh triggers: `workspace.changed`, `agent.status.changed` done for plugin-launched terminals, Refresh request
- [x] 3.5 `promptFor()` honoring `commandStyle`; `launchVisible()` (launch without prompt, focus, poll for readiness, send text, report timeout)
- [x] 3.6 Palette commands using the selected change (or the only change); `openspec init` terminal action
- [x] 3.7 `src/worker.test.ts` with injected timings/runners

## 4. Panel

- [x] 4.1 `src/panel.tsx`: Changes and Specs tabs with counts, filters, status dropdown, progress rows
- [x] 4.2 Header: New change button and form (description, agent, Explore/Propose), Refresh
- [x] 4.3 Selected change actions (Apply, Verify, Archive when done), "not set up" state with Init OpenSpec, remote message
- [x] 4.4 `src/panel.check.ts` scenarios and `src/panel.test.tsx`

## 5. Verify and document

- [x] 5.1 Run `orca plugin test .` and `orca plugin check .`
- [ ] 5.2 Manual check in Orca via `orca plugin dev watch .` (user approves the capability fingerprint)
- [x] 5.3 Write `README.md` (install, requirements, permissions, limitations) with attribution to the reference plugin
