# Search

## Purpose

Define keyboard-first navigation from the search input: filtering notes by query
and zooming to a result.

## Terms

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note currently targeted by search navigation.
- **Result row:** the rendering for a single search result (see Result row
  context).

## Scope and boundaries

1. Search always runs against the current active document only.
2. Search empty states (`No matches` / `No notes`) mean the current active
   document has no matching/all candidates. They do not represent invalid
   routes, unavailable documents, or offline loading states.
3. Runtime document-ID ownership and route/link identity are defined in
   [Note IDs](./note-ids.md) and [Links](./links.md), not in this search spec.

## Behavior

1. Focusing the search box enters Search Mode (including `Cmd/Ctrl+F`).
2. Search Mode shows a flat results list sourced from document notes.
3. Search results and empty states appear only after the active document's
   search candidates are available.
4. Search Mode has exactly one highlighted note when candidates exist.
5. When query text is empty, flat results include all document notes.
6. Typing in the search box filters flat results by query matching. The query is
   a plain-text field split on whitespace into tokens (order-independent; extra
   whitespace ignored). A note matches when every token is a case-insensitive
   substring of some entry in the note's [note path](./concepts.md#definitions),
   and at least one token matches the note's own text. Results stay in document
   order. Matched tokens are highlighted wherever they occur — in the note label
   or an ancestor crumb. The note-link picker (see [Links](./links.md)) uses this
   same query matching.
7. `ArrowDown` highlights the next flat result.
8. `ArrowUp` highlights the previous flat result.
9. Arrow navigation stops at the first/last available note (no wraparound).
10. Pointer hover over a flat result highlights it, the same as arrow navigation
    (without moving focus out of the search box).
11. If flat results are empty, there is no highlighted note.
12. Search Mode ends when the search box loses focus.
13. `Enter` moves focus to the editor and zooms to the highlighted note.
14. `Escape` moves focus to the editor.
15. Search input exposes combobox semantics for assistive tech, including popup
    state and active descendant linkage.
16. Search results expose listbox semantics and mark the highlighted result as
    selected.

## Result row context

Result rows carry enough structural context to tell apart matches that share the
same text, without zooming into one (which ends Search Mode). Every row uses the
same layout regardless of highlight, so moving the highlight only restyles the
selected row and never re-lays-out the list.

1. Every result row shows the matched note as a primary label line, a dim
   ancestor-path subline beneath it, then a preview of the match's first two
   direct children.
2. The matched note's text is the primary label: query tokens that occur in it
   are highlighted, and the note's text formatting is preserved (for example a
   checked note is struck through). The label shows no list marker — no bullet,
   number, or checkbox.
3. The subline lists the full ancestor chain (excluding the matched note),
   separated by `/`, including the top-level note for context. A match with no
   ancestors (itself top-level) shows no subline. The subline stays on a single
   line, fitting under a combined budget that sacrifices depth before width:
   - **Depth.** The first and last shown crumbs are always kept. When the shown
     chain exceeds four crumbs the middle collapses to a single `⋯` crumb between
     the first two and last two; the `⋯` crumb exposes the hidden crumb labels (in
     order) as a tooltip.
   - **Width.** Crumbs share the available row width: each shrinks and overflows
     with an ellipsis rather than wrapping, so the subline uses more of a wide
     results pane and tightens on a narrow one (adjusting on resize). A crumb
     truncated by width exposes its full label as a tooltip.
4. Ancestor crumbs are visually subordinate to the match — muted in colour and
   smaller, with an underline only on hover — so the matched note reads as the
   row's subject. Query tokens that matched an ancestor are highlighted in its
   crumb.
5. Every ancestor crumb is activatable; activating it zooms that ancestor and
   ends Search Mode, exactly like accepting a result.
6. The child preview shows the first two direct children of the match rendered
   with the outline's own list markers (bullet, number, or checkbox per child's
   list type, checked children struck through), matching how they look in the
   editor. A match with no children shows no preview; a match with more than two
   children indicates the remaining count.
7. Result row context is sourced from the active document's search candidates and
   appears only once those candidates are available.

## Future

- Richer query matching: fuzzy matching and result ranking.
