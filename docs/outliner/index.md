# Outliner Overview

## Purpose

Provide a single entry point for RemDo’s outlining behavior: what a note is, how selections work, and how
structure changes are executed. This page routes to the dedicated specs for each area instead of restating their
details.

## Map

1. **Concept & invariants:** `./concepts.md` — canonical note model (structure/content/props) and adapter framing.
2. **Note identity:** `./note-ids.md` — `noteId` invariants, lifecycle, and global reference rules.
3. **Selection:** `./selection.md` — whole-note, contiguous slab selection model and shortcut ladder.
4. **Zoom view:** `./zoom.md` — subtree isolation, breadcrumbs, and route state.
5. **Folding:** `./folding.md` — collapse/expand note subtrees, visibility
   filtering, and persistence.
6. **List types:** `./list-types.md` — bullet/number/check semantics and checked state.
7. **Links:** `./links.md` — initial internal note-linking behavior, picker/query rules, and future boundaries.
8. **Note menu:** `./menu.md` — note-scoped menu entry points, targets, and actions.
9. **Clipboard:** `./clipboard.md` — cut/copy/paste behavior, caret placement, and move rules.
10. **Indent/Outdent & structure rules:** `./note-structure-rules.md` — structural invariants and indent/outdent semantics.
11. **Insertion (Enter):** `../insertion.md` — caret-mode Enter behaviors (start/middle/end) and focus rules.
12. **Reordering (keyboard):** `./reordering.md` — Reordering behavior and
   placement invariants.
13. **Reordering (drag & drop):** `./drag-and-drop.md` — not supported yet; future plan lives here.
14. **Deletion:** `./deletion.md` — caret vs. structural deletion semantics, merge/no-op rules, and spacing contract.

## Glossary (minimal)

1. **Note:** smallest addressable unit in the ordered tree (see `./concepts.md`).
2. **Subtree:** a note and all of its descendants; moves are always subtree-atomic.
3. **Sibling slab:** a contiguous run of sibling notes under the same parent.

## Usage

1. Global invariants/definitions are single-source; other specs must rely on them and must not duplicate them.
2. When editing docs, keep each linked file scoped to its topic and prefer cross-linking over duplication.
3. Add new topics (e.g., drag-and-drop reordering) as their own entries in the Map instead of folding them into
   existing pages.
