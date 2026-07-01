# Documentation Index

## Purpose

Provide the entry point for RemDo documentation navigation: the map of every
doc and its summary. Doc workflow and the documentation invariants live in
`docs/contributing.md#documentation`.

## Documentation Map

Length buckets: Short (<300 words), Medium (300–800), Long (800–1500), Very long
(>1500). Update a doc’s bucket only when it crosses a boundary.
Map format: maintain alphabetical order and wrap entries at ~100 characters per
line (align continuation lines by two spaces).
Keep the map current—refresh summaries/buckets only when they are materially
outdated or a doc’s role materially changes.

- `docs/access-model.md` (Long). Document access model for RemDo:
  owner-backed access, direct local-user grants, cross-server source linking,
  deferred public/link access, authenticated app access, and the persistent
  admin role.
- `docs/architecture.md` (Long). Cross-cutting architecture vocabulary for
  delivery surfaces, gateway/origin boundaries, Better Auth identity, document
  identity, Kysely-backed document-registry ownership, collaboration runtime
  building blocks, and multi-hub terms.
- `docs/config.md` (Medium). Configuration boundary: the single config owner,
  the settable input variables vs. derived values, dev/prod port regimes,
  `APP_PUBLIC_URL`-vs-bind-`PORT` separation, the secret bootstrap contract, and
  admin enrollment.
- `docs/contributing.md` (Medium). Runtime baselines, Git workflow (`origin/main`
  as PR baseline, the branch fork point marked with the `wip-base` tag) and
  branch-prefix conventions, editor feature module layout, pre-1.0 compatibility
  policy (no default migration/back-compat requirements), and the doc
  workflow + documentation invariants.
- `docs/dev/dependency-maintenance.md` (Medium). Standing policy for dependency
  refresh work — durable rules and self-healing mechanisms (pnpm release-age
  gate, why Dependabot version updates are off for pnpm catalogs, independent
  security alerts, build-script approval, Node/Docker base lag). Individual
  workarounds live as `TODO:`/`FIXME:` markers at their code sites, not here.
- `docs/run-modes.md` (Long). Supported run modes: local dev, test stacks, CI,
  self-hosted app runtimes, managed cloud, and backup execution.
- `docs/hints.md` (Short). UX hint concepts for search, note controls, and
  structural selection guidance.
- `docs/index.md` (Medium). Documentation map: every doc plus its summary and
  length bucket. Doc workflow and invariants live in `docs/contributing.md`.
- `docs/outliner/body.md` (Short). Note body: optional rich-text region attached
  to a note via `Shift+Enter`, with its own trapped inline selection world (it is
  still a restricted kind of note, selectable structurally as part of its owner).
- `docs/outliner/clipboard.md` (Short). Cut/copy/paste rules, inline selection multi-line
  handling, caret placement, and move marker behavior.
- `docs/outliner/concepts.md` (Medium). Note model, root note, invariants, adapters, fixtures.
- `docs/outliner/dates.md` (Medium). Inline date node behavior: the `!` modal
  calendar-dialog picker (today default, full grid keyboard nav, edit mode) over
  the shared popup contract, atomic token keyboard behavior, and future
  editable-date and typed-date-query boundaries.
- `docs/outliner/deletion.md` (Medium). Caret/structural delete semantics, merge/reparent
  rules, spacing.
- `docs/outliner/drag-and-drop.md` (Short). Pointer reordering placement semantics.
- `docs/outliner/folding.md` (Medium). Note folding behavior, toggle visibility
  (hover/caret), persistence, auto-expand rules, and view-scoped
  fold-to-level commands.
- `docs/outliner/index.md` (Medium). Entry point with links (including dates and
  list types); single-source invariants rule.
- `docs/outliner/insertion.md` (Medium). Caret-mode `Enter` behavior, zoom-boundary
  insertion rules, focus rules, and paste placement pointer.
- `docs/outliner/list-types.md` (Short). List types (bullet/number/check), checked state persistence,
  rendering, and toggle commands.
- `docs/outliner/links.md` (Medium). Note-linking behavior and the
  internal-vs-external link boundary: the `@`-specific query/ranking and commit
  over the shared trigger lifecycle, path-token picker matching shared with
  search, runtime fully qualified link identity, clipboard/persistence docId
  boundaries, and cross-document boundaries.
- `docs/outliner/menu.md` (Medium). Quick action menu entry points, note vs.
  children vs. view action scopes, and actions (toggle checked/fold/zoom/child
  list types/fold view to level).
- `docs/outliner/note-ids.md` (Medium). Note id invariants, normalization,
  runtime document-id ownership, clipboard identity rules, collab, and
  `noteRef`.
- `docs/outliner/note-structure-rules.md` (Long). Structural invariants and indentation
  semantics; indent/outdent rules; deletion-merge exception.
- `docs/outliner/popups.md` (Medium). The shared contract for transient editor
  popups — keyboard ownership with an editable-span exception, one open at a time,
  light-dismiss, validated commit, per-widget Tab and focus model — plus the
  trigger-picker pinned session built on it.
- `docs/outliner/reordering.md` (Short). Directional reorder fallback cascade: swap,
  parent-sibling reparent, outdent, then no-op.
- `docs/outliner/search.md` (Long). Search behavior: focus-driven mode
  entry/exit, single highlighted note in flat results (including empty query)
  capped at the first ten matches with a refine-to-narrow cue, path-token query
  matching (order-independent substring tokens over a note's ancestor path, with
  at least one token on the note itself), Enter-to-zoom,
  click/hover and arrow navigation, combobox/listbox accessibility semantics, and uniform
  per-result structural context (matched note as primary label, a dim truncating
  ancestor subline with clickable crumbs and token highlighting, and an
  editor-faithful child preview with per-type list markers).
- `docs/outliner/selection.md` (Long). Selection states and whole-note
  snapping, the anchored intent-replay selection ladder (symmetric grow/shrink),
  input bindings, collaboration reshaping tiers, and command compatibility.
- `docs/outliner/zoom.md` (Medium). Subtree zoom view, zoom-boundary editing
  scope, breadcrumbs, and routing.
- `docs/performance/client-side-perf-tests.md` (Medium). Minimal client-side
  perf baseline spec: median metric and core modes/operations/workloads, plus
  optional experiments (warmups, thresholds, baselines, and gating).
- `docs/principles.md` (Medium). Durable project assumptions: privacy,
  transparency, deployment goals, multi-origin direction, and the boundary
  between principles and replaceable tooling choices.
- `docs/todo.md` (Medium). Active work scratchpad; move durable specs into docs;
  tracks paste-placement e2e follow-up and prod schema recovery decisions.
Whenever you edit any of these docs, update their summaries/buckets here so the
map stays trustworthy.
The `docs/todo.md` summary should remain as-is and should not be automatically
updated like other doc entries.
