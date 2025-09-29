# RemDo – Agent Guidelines

## Scope

- This repo is a TypeScript + React app that builds on the upstream Lexical packages with a thin RemDo-specific layer.
- Do not stage or commit any changes without explicit approval.

## Quick Start

- Install: `npm ci` (CI) or `npm install` (local).
- Dev server: `npm run server` (Vite on port from `config/env.server.ts`, default 3010).
- Collaboration backends (port 8080):
  - WebSocket (no persistence): `npm run websocket`.
  - WebSocket with persistence: `npm run websocket-persist` (stores in `./data/yjsDB`).
  - Alternative (Hocuspocus): `npm run hocuspocus`.
- In browser:
  - Disable WS for local/editor-only: add `?ws=false` to the URL.
  - Choose document: navbar “Documents” or `?documentID=your-file`.
  - Enable dev toolbar: `?debug=true` or toggle via navbar.

## Repo Structure

- `src/`
  - `components/Editor/` editor shell and RemDo plugins (`plugins/remdo/**`).
  - `components/Editor/DocumentSelector/` Yjs provider + document switcher.
  - `components/Dev/` dev-only helpers (TreeView, Yjs debug, demo).
  - `DebugContext.tsx` toggles dev features via query param and navbar.
  - `utils.ts` UI helpers (method patching, relative positioning, ::before hit testing).
- `tests/` Vitest unit (jsdom) and Playwright browser tests; fixtures in `tests/data`.
- `config/` env and Vite/test configuration helpers.
- `data/` build/test outputs (reports, coverage, bundle stats).

## How It Works

- Data model: notes are Lexical `ListItemNode`s enhanced with:
  - `id` (short id), `folded` (boolean), `checked` (boolean | undefined).
- Single-root invariant: `root → ListNode → ListItemNode*` enforced by `RootSchemaPlugin`.
- Focus: `NOTES_FOCUS_COMMAND` updates the Remdo state (see `plugins/remdo/utils/remdoState.ts`) and route (`/note/:id`). Only the focused note subtree renders as “unfiltered”.
- Search filter: the Remdo state filter drives `.filtered/.unfiltered` classes; `NoteMetadataPlugin` updates DOM classes based on the shared state.
- Keyboard:
  - Indent/outdent: Tab / Shift+Tab (`IndentationPlugin`).
  - Reorder: Meta+ArrowUp/ArrowDown (`ReorderPlugin`).
  - Toggle check: Meta+Enter (`CheckPlugin`).
  - Quick menu: double Shift (`QuickMenuPlugin`).
  - Backspace at start of note merges or deletes (`BackspacePlugin`).
- Prefer the `Note` API (`plugins/remdo/utils/api.ts`) for mutations: `createChild`, `indent/outdent`, `moveUp/down`, `toggleChecked`, `setFoldLevel`, `focus`.

## Lexical Integration

- RemDo relies on the published `lexical` packages (`0.35.x`) and a few local shims in `src/lexical-shims` for APIs that are not part of the public surface (e.g., list node helpers).
- When upgrading Lexical, audit those shims and the RemDo plugins for compatibility before bumping the versions in `package.json`.

## Conventions

- Lint/format: ESLint + Prettier. Prefer the flat config `eslint.config.mjs` as the source of truth.
- Imports: use `@/...` for app code; avoid internal Lexical paths unless mirrored via `src/lexical-shims`.
- Plugin naming: Lexical state plugins live in `plugins/remdo`. Pure UI overlays mounted via portals should be named `*Overlay` or `*UI` (e.g., `QuickMenuOverlay`).
- Updates: use `editor.update(...)` normally; `editor.fullUpdate(...)` is only required when you need a forced reconcile for Lexical internals.
- Centralize new editor commands in `plugins/remdo/utils/commands.ts`.

## Documentation Style

- Prefer comments that explain the current state and intent for future readers,
  not a narrative of “what changed in this PR”. Focus on:
  - invariants and assumptions that must hold,
  - why something is done a particular way,
  - how to safely extend or modify it.
- When using Lexical internals or monorepo source imports, include a brief note
  and point to the alias definitions (tsconfig paths, Vite resolve.alias). Migrate
  to public APIs when they become available.

## Environment Access

- Do not read `process.env` directly in app or test code. Import `env` from
  `config/env.server.ts` (envalid-backed) and use `env.MY_VAR` instead. This keeps
  defaults and validation consistent across the repo. Only low-level config files
  (e.g., Vite/Playwright) may need direct `process.env` reads.

## Running Watch Commands in This CLI

- Long‑running “watch” tasks (e.g., `vitest --watch`, Playwright watch/UI) keep
  the process attached and can hang this chat session. When you need to verify
  a watch command from here, wrap it with a timeout, for example:

  ```sh
  timeout 10s npm run test-browser-watch || true
  ```

- Use the app’s Dev links (e.g., “Playwright Report”) or `npm run test-browser-show-report`
  to inspect artifacts after a short watch run. Prefer running full interactive
  watch sessions in your own terminal instead of this chat.

## Command Execution Policy (timeouts)

- To keep this session responsive, all shell commands invoked from the agent
  use sane timeouts by default:
  - default: 60s for typical commands (lint, unit tests, short scripts).
  - extended: up to 5 minutes for installs/builds when necessary (npm i/ci,
    vite build, playwright downloads), with a short note explaining why.
  - watch/interactive commands: always wrapped with a short timeout (e.g., 10–15s)
    for smoke verification only; use your own terminal for continuous runs.
- If a command needs more time, we’ll state the reason and bump the timeout
  explicitly for that call. Long‑running commands will not be left unbounded.

## Testing

- Unit (Vitest): `npm run test-unit`.
  - Use `tests/unit/common` helpers: run mutations in `context.lexicalUpdate(fn)`; load serialized states with `context.load(nameOrPath)`.
  - Prefer JSON/YAML snapshots for structure; DOM snapshots where UI matters.
- Browser (Playwright): `npm run test-browser` (spins Vite, stores artifacts in `data/`).
- Watch/coverage: see `package.json` (`test-unit-watch`, `test-unit-watch-coverage`, `test-browser-watch`).

## Environment & Ports

- `config/env.server.ts` defaults:
  - `PORT` (Vite) default 3010.
  - WebSocket server default 8080.
- Useful query params: `?debug=true`, `?ws=false`, `?documentID=...`.

## Safety & Process

- Never commit or stage without explicit approval.
- Call out any Lexical version bumps or shim updates for explicit review.
- For behavior changes, add/update unit and browser tests.

## CI & Submodules (Public Repo)

- This repository is public: https://github.com/remdo-project/remdo

## Common Tasks

- Add/edit an editor feature: create a RemDo plugin in `plugins/remdo` and wire commands in `utils/commands.ts`.
- Edit note behavior: use `Note` API; rely on `RootSchemaPlugin` to normalize when structure changes.
- Add a keyboard shortcut: register in the relevant plugin; avoid global listeners; document here.

## Known Gaps

- `src/components/Editor/plugins/remdo/utils/unexported.ts` is missing imports for `LexicalEditor`, `NodeKey`, and `invariant`. Add:

  ```ts
  import type { LexicalEditor, NodeKey } from "lexical";
  import invariant from "shared/invariant";
  ```

- `useEditorConfig.disableWS` is ambiguous; consider renaming to `collabDisabled` or `collabMode`.
- `QuickMenuPlugin` is a UI component; consider renaming to match the overlay/UI convention.

## Design/Style Decisions To Confirm

- Adopt `*Overlay`/`*UI` naming for non-Lexical “plugins”?
- Rename `disableWS` to `collabDisabled` (boolean) or `collabMode: 'websocket' | 'none'`?
- Prefer lightweight helpers (`syncAllListMetadata`) over `editor.fullUpdate` unless a full reconcile is required?
- Standardize keyboard map (e.g., Quick menu on Double Shift vs Ctrl/Cmd+K)?
- Confirm `Note` API as the public surface for editor mutations.


## CI Logs

- Use the GitHub CLI (gh) to check repository and Actions status on GitHub.
