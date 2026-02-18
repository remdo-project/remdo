# Documentation Index

## Purpose

Provide the entry point for RemDo documentation navigation and documentation
maintenance rules (map, workflow, and invariants).

## Documentation Map

Length buckets: Short (<300 words), Medium (300–800), Long (800–1500), Very long
(>1500). Update a doc’s bucket only when it crosses a boundary.
Map format: maintain alphabetical order and wrap entries at ~100 characters per
line (align continuation lines by two spaces).
Keep the map current—refresh summaries/buckets only when they are materially
outdated or a doc’s role materially changes.

- `docs/contributing.md` (Medium). Runtime baselines, Git workflow/branch conventions, and
  pre-1.0 compatibility policy (no default migration/back-compat requirements).
- `docs/environment.md` (Medium). Env setup for dev/test/prod/CI, including
  single-container Docker deployment flow, same-host auth routing, and
  backup/CI conventions.
- `docs/index.md` (Medium). Documentation entry point with map, doc workflow, and invariants.
- `docs/outliner/clipboard.md` (Short). Cut/copy/paste rules, inline selection multi-line
  handling, caret placement, and move marker behavior.
- `docs/outliner/concepts.md` (Medium). Note model, root note, invariants, adapters, fixtures.
- `docs/outliner/deletion.md` (Medium). Caret/structural delete semantics, merge/reparent
  rules, spacing.
- `docs/outliner/drag-and-drop.md` (Short). Pointer reordering plan (not implemented).
- `docs/outliner/folding.md` (Short). Note folding behavior, toggle visibility (hover/caret),
  persistence, and auto-expand rules.
- `docs/outliner/index.md` (Medium). Entry point with links (including list
  types); single-source invariants rule.
- `docs/outliner/insertion.md` (Medium). Caret-mode `Enter` behavior, zoom-boundary
  insertion rules, focus rules, and paste placement pointer.
- `docs/outliner/list-types.md` (Short). List types (bullet/number/check), checked state persistence,
  rendering, and toggle commands.
- `docs/outliner/links.md` (Medium). Note-linking behavior: `@` query
  flow, whole-document search/ranking, runtime fully qualified link identity,
  clipboard/persistence docId boundaries, and cross-document roadmap limits.
- `docs/outliner/menu.md` (Short). Note menu entry points, icon visibility (hover/caret),
  targets, and actions (toggle checked/fold/zoom/child list types).
- `docs/outliner/note-ids.md` (Medium). Note id invariants, normalization,
  runtime document-id ownership, clipboard identity rules, collab, and
  `noteRef`.
- `docs/outliner/note-structure-rules.md` (Long). Structural invariants and indentation
  semantics; indent/outdent rules; deletion-merge exception.
- `docs/outliner/reordering.md` (Short). Directional reorder fallback cascade: swap,
  parent-sibling reparent, outdent, then no-op.
- `docs/outliner/selection.md` (Long). Cursor/selection ladder, command compatibility, directional boundary rules.
- `docs/outliner/zoom.md` (Medium). Subtree zoom view, zoom-boundary editing
  scope, breadcrumbs, and routing.
- `docs/todo.md` (Medium). Active work scratchpad; move durable specs into docs;
  tracks paste-placement e2e follow-up and prod schema recovery decisions.
Whenever you edit any of these docs, update their summaries/buckets here so the
map stays trustworthy.
The `docs/todo.md` summary should remain as-is and should not be automatically
updated like other doc entries.

## Doc Workflow

1. Before coding, identify the feature area and read the matching sections from
   the map above; do not reread unrelated docs.
2. While working, deep-link to the authoritative doc (e.g.,
   `docs/contributing.md#git-workflow`) in discussions or PRs so others know the
   source of truth.
3. After modifying documentation, refresh this map so the pointers stay current.
   Do not add update-tracking sections to AGENTS.md.

### Documentation invariants

1. **Single source per topic.** Define each behavior once in the doc best suited
   to it; eliminate duplicates and replace any extra copies with pointers.
2. **Top-down linking.** Prefer links from higher-level docs (index, concepts)
   into detailed docs (selection, indent/outdent, reordering); same-level links
   only when they add clear value.
3. **Self-contained set.** Keep required context inside this doc set; avoid
   external references.
4. **Coherence checks.** When editing a doc, ensure the change aligns with
   existing resolutions and update related docs/maps if needed.
5. **Intentional gaps.** Stubs/placeholders are acceptable in dev—mark status
   clearly when a section is partial.
6. **[Future] markers.** Sections or bullets tagged `[Future]` are exploratory;
   do not design, code, or test against them until they are promoted into the
   main spec.
7. **Behavior changes require doc updates.** When behavior changes, update the
   affected docs in the same change. If no doc update is needed, explicitly
   state why.
8. **Move/rename hygiene.** When moving or renaming docs, update all inbound
   links and the documentation map in the same change; do not leave temporary
   broken references.
