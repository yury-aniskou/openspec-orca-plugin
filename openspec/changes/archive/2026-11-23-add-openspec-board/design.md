# Design

## Context

Orca places plugin panels only in the right sidebar, so a full-size board must be a custom editor (`customEditors`, since Orca 1.4.245; `.ts` entry needs 1.4.246; `frame: "isolated"` 1.4.248) that opens `*.openspec` files. Editors get no Orca components and no file system; they talk to the worker through `orca.plugin.request` / `orca.plugin.on`. This builds on the panel plugin's worker, protocol and `src/openspec.ts`. Verify the editor API against `.orca/types` before implementing.

## Goals / Non-Goals

**Goals:**
- Board and detail pages with the same status classification as the panel (shared `src/view.ts`).
- Safe by construction: no raw HTML, no file access outside `openspec/`.

**Non-Goals:**
- Stores, system-prefix scope, remote workspaces, model picker.
- Editing files inside the board (Edit opens Orca's editor).

## Decisions

- **Custom editor over a marker file.** `openspec/board.openspec` is created on first open and added to `openspec/.gitignore`; never overwritten (`wx` flag). `hasOpenSpec()` already ignores a lone board file.
- **Plain DOM board** in `board/main.ts`, styled with `--orca-*` CSS variables, importing `src/view.ts` and `src/protocol.ts` types. Rationale: editors can't use panel components. Alternative (React/bundler) rejected: the plugin has no build step.
- **Markdown renderer** `board/markdown.ts` builds DOM from text nodes only, never `innerHTML`; unit-tested with node tests. Checkbox class `chk` (not `.box`).
- **On-demand file data.** The board state carries only summary fields; file contents arrive via requests `openspec.changeFiles`, `openspec.readFile`, `openspec.specInfo`, `openspec.archived` (paged), `openspec.openFile`, `openspec.promptFor`. Extend `ChangeInfo` with optional `next`, `summary`, `created`.
- **`resolveInside(root, path)`** refuses anything not a `.md` under `openspec/` after `realpath` (blocks `..` and symlinks). Rationale: the editor frame is trusted code but file content is not.
- **Navigation state** is module-level (`current` view) with a `navSeq` counter so stale async responses are dropped; `receive()` redraws a change page only when that change changed; identical board redraws are skipped so clicks aren't swallowed while an agent edits files.
- **Archive confirm only on the board**; the sidebar never confirms.
- **Open flow in worker** `openBoard()`: require local workspace with OpenSpec, ensure file, call `editor.open` with a relative path, falling back to absolute.
- **Deep link from panel** (double-click a change opens its page) is deferred; not required by the specs.

## Risks / Trade-offs

- Adding a command and an editor changes the approval fingerprint → user must re-approve; never approve for them.
- `orca plugin dev load` can report ok while Orca keeps the old manifest → run `orca plugin dev reload .` after manifest edits.
- The panel test kit does not cover the board → unit-test `markdown.ts` and pure helpers, and verify live (`orca plugin shot <key> --editor <file>`).
- Large archives → page 40 at a time, filter server-side.
