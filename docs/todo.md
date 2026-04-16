# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Search architecture

- Add a document-level SDK visitor/walker API and use it as the shared
  traversal primitive for search snapshot building and note-link candidate
  collection. Keep search/query semantics and note-link ranking/disambiguation
  outside the SDK.
- Make lexical note lookup indexed / amortized `O(1)` and move SDK handle reads
  (`textOf`, `childrenOf`, `hasNote`, `note(...)`) onto that path so search and
  other SDK consumers do not pay scan-based lookup costs per visited note.
- [Future] Evaluate unifying candidate discovery/query logic between search and
  link picker (search already uses SDK/Lexical candidates; link picker still
  uses its own traversal/filter pipeline).


## Collaboration architecture roadmap [Future]

- User-config runtime follow-up: observe remote/shared `documents` mutations in
  `src/documents/stored-user-config.ts` and refresh the local store version so
  document-switcher state stays current across tabs/sessions. Retry-on-startup
  recovery can land independently first.
- User-config route follow-up: handle rejected `documentList().create()` calls
  from the document picker in `src/routes/DocumentRoute.tsx` so sync/write
  failures do not surface as unhandled promise rejections and the UI can
  recover cleanly.

### Stages and success criteria

1. ✅ Done **Stage 0: single hub, online-first.**
   Success: one server is the single collaboration backend for docs.
2. ✅ Done **Stage 1: offline doc persistence.**
   Success: an already-opened doc can be edited offline and syncs on reconnect.
3. ✅ Done **Stage 2: offline app-shell loading.**
   Success: the app shell can open offline (for example via PWA caching), even
   before document data sync is available.
4. **Stage 3: multi-hub client.**
   Success: one client can browse/edit docs from multiple trusted hubs.
5. **Stage 4: local vault hub (optional).**
   Success: local-only docs behave like normal docs and remain device-local.

## Note-first SDK follow-ups

- Generic note handles, document-specific note kinds, and persisted user-config
  storage are in place. Remaining work:
  1. Introduce async walker/finder/query helpers for search and note-link
     completion so cross-document traversal does not force raw recursive
     `children()` traversal into callers.
  2. Settle long-term `DocumentNote` semantics for non-current documents:
     loading model, whether `children()` can hydrate, and which operations are
     allowed before document content is loaded.
  3. Clarify the remaining query/loading boundary:
     whether cross-document link search should load trees directly or use a
     separate index/search layer.
  4. Clarify mutation boundaries only as needed by the new traversal/query
     layer (single-note writes vs transactional/multi-note updates).
  5. Review the remaining top-level API naming after the note-owned
     `create(...)` refactor, especially `createLexicalEditorNotes` and
     `place(...)`.
  6. Update the durable docs once the traversal/query contract stabilizes:
     `docs/outliner/concepts.md`, `docs/architecture.md`,
     `docs/outliner/search.md`, and `docs/outliner/links.md`.

## Test harness follow-ups

- Reduce repeated full-outline literals in tests by adding a generic helper
  that patches a previously-read outline by `noteId`, then still asserts with
  `toMatchOutline`.
- Prefer this over property-specific helpers like `setFolded(...)`: tests stay
  focused on the changed notes while still verifying that untouched notes remain
  unchanged.
- Revisit `meta(... viewProps ...)` setup, especially zoom-related state.
  Prefer simple explicit test actions (for example dispatching the real zoom
  command, or at most a thin helper around it) over smart harness metadata that
  adds API surface, hides behavior setup, and cannot be changed mid-test.

## Warning and drift detection follow-ups

- Pin / drift decisions:
  1. Decide whether to replace `pnpm dlx esbuild` in `docker/Dockerfile` with a
     lockfile-backed tool path or at least an exact version; Docker currently
     pulls a different `esbuild` than the workspace.
  2. Decide whether `docker/Dockerfile` should keep `y-sweet@^0.9.1` or pin an
     exact version for deterministic image builds.
  3. Decide whether to update the pinned `packageManager` version in
     `package.json` or intentionally keep the current pnpm line and suppress the
     resulting upgrade notices elsewhere.

- Add more deterministic detection:
  1. Extend `tools/check-pnpm-policy.ts` to flag floating install surfaces such
     as committed `pnpm dlx` usage and ranged `npm install -g` in Dockerfiles or
     scripts.
  2. Add a plain `pnpm run build` validation surface to CI and/or the dependency
     refresh flow so build warnings are reviewed explicitly instead of only via
     Docker logs.
  3. Revisit pnpm build-script policy: consider moving from
     `onlyBuiltDependencies` to `allowBuilds` and enabling
     `strictDepBuilds: true`.

- Warning policy / classify-or-suppress:
  1. Decide how to handle the Vite large-chunk warning: real size budget,
     accepted warning, or follow-up chunking work.
  2. Decide how to handle the `snapshot.mjs` esbuild size warning in Docker:
     explicit budget, suppression, or accepted noise.
  3. Decide whether to suppress or just classify the `NO_COLOR` / `FORCE_COLOR`
     warnings seen during Docker Playwright runs.
  4. Review current install-time warnings and classify each as `fix`, `track`,
     or `ignore`, especially:
     `glob@11.1.0`, `source-map@0.8.0-beta.0`, `sourcemap-codec@1.4.8`, and the
     `@typescript-eslint/*` peer mismatch against `typescript 6`.
