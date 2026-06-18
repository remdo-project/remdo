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
  deferred public/link access, and authenticated app access.
- `docs/architecture.md` (Long). Cross-cutting architecture vocabulary for
  delivery surfaces, gateway/origin boundaries, Better Auth identity, document
  identity, Kysely-backed document-registry ownership, collaboration runtime
  building blocks, and multi-hub terms.
- `docs/config.md` (Medium). Configuration boundary: the single config owner,
  the settable input variables vs. derived values, dev/prod port regimes,
  `APP_PUBLIC_URL`-vs-bind-`PORT` separation, and the secret bootstrap contract.
- `docs/contributing.md` (Medium). Runtime baselines, Git workflow (local topic
  branches off the `origin/main` baseline, marked with the `wip-base` tag) and
  branch-prefix conventions, editor feature module layout, pre-1.0 compatibility
  policy (no default migration/back-compat requirements), and the doc
  workflow + documentation invariants.
- `docs/dev/dependency-maintenance.md` (Medium). Temporary dependency/runtime
  workarounds plus intentionally held-back versions, with current rationale and
  revisit conditions for refresh work.
- `docs/run-modes.md` (Long). Supported run modes: local dev, test stacks, CI,
  self-hosted app runtimes, managed cloud, and backup execution.
- `docs/hints.md` (Short). UX hint concepts for search, note controls, and
  structural selection guidance.
- `docs/index.md` (Medium). Documentation map: every doc plus its summary and
  length bucket. Doc workflow and invariants live in `docs/contributing.md`.
- `docs/outliner/clipboard.md` (Short). Cut/copy/paste rules, inline selection multi-line
  handling, caret placement, and move marker behavior.
- `docs/outliner/concepts.md` (Medium). Note model, root note, invariants, adapters, fixtures.
- `docs/outliner/dates.md` (Medium). Inline date node behavior: `!` picker
  trigger boundaries, insert/edit interactions, default date handling, dismissal
  keys, outside-click handling, atomic token keyboard behavior, and future
  editable-date and picker-keyboard boundaries.
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
  internal-vs-external link boundary: `@` query flow, whole-document
  search/ranking, runtime fully qualified link identity, clipboard/persistence
  docId boundaries, and cross-document boundaries.
- `docs/outliner/menu.md` (Medium). Quick action menu entry points, note vs.
  children vs. view action scopes, and actions (toggle checked/fold/zoom/child
  list types/fold view to level).
- `docs/outliner/note-ids.md` (Medium). Note id invariants, normalization,
  runtime document-id ownership, clipboard identity rules, collab, and
  `noteRef`.
- `docs/outliner/note-structure-rules.md` (Long). Structural invariants and indentation
  semantics; indent/outdent rules; deletion-merge exception.
- `docs/outliner/reordering.md` (Short). Directional reorder fallback cascade: swap,
  parent-sibling reparent, outdent, then no-op.
- `docs/outliner/search.md` (Long). Search behavior: focus-driven mode
  entry/exit, single highlighted note in always-flat results (including empty
  query), text-match filtering, Enter-to-zoom, slash root/depth navigation,
  invalid slash paths staying empty, non-mutating arrow cycling in slash mode,
  inline-completion acceptance with `ArrowRight`, combobox/listbox
  accessibility semantics, non-leaf `/...` result hints, and uniform per-result
  structural context (matched note as primary label with term highlighting, a dim
  truncating ancestor subline with clickable crumbs, and an editor-faithful child
  preview with per-type list markers).
- `docs/outliner/selection.md` (Long). Cursor/selection ladder, command compatibility, directional boundary rules.
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
