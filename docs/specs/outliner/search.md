# Search

The search input provides keyboard-first navigation by filtering notes and
zooming to a result.

## Definitions

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note targeted by search navigation.
- **Result row:** the rendering for a single search result (see Result row context).
- **`No matches`:** the empty-state label shown when a non-empty current query
  produces no flat results.
- **`No notes`:** the empty-state label shown when the current query is empty
  and the active document has no search candidates.

## Scope and boundaries

1. Search covers all [editor notes](./note-model.md#note-kinds) in the active
   document, including descendants hidden by [folding](./folding.md) and notes
   outside the current [zoom boundary](./zoom.md#definitions). Its note data comes
   from the active [open document session](./document-session.md).
2. Runtime document-ID ownership and route/link identity are defined in
   [Note IDs](./note-ids.md) and [Links](./links.md), not in this search spec.

## Evaluation and freshness

1. Entering Search Mode or changing the query searches the current committed
   document state.
2. Content changes need not refresh results; empty and non-empty results follow
   the same policy.
3. Empty-state labels appear only after a successful search of available
   document data.
4. Results and empty-state labels clear when the active document changes or
   becomes unavailable. While Search Mode remains active, the current query is
   evaluated when the document becomes available.

## Behavior

1. Focusing the search box enters Search Mode (including `Cmd/Ctrl+F`).
2. Search Mode shows a flat results list sourced from document notes.
3. Search Mode has exactly one highlighted note when candidates exist.
4. When query text is empty, flat results draw from all document notes (capped
   per the result limit below).
5. Typing in the search box filters flat results by query matching. The query is
   a plain-text field split on whitespace into tokens (order-independent; extra
   whitespace ignored). A note matches when every token is a case-insensitive
   substring of some entry in the note's [note path](./note-model.md#definitions)
   or its own [body](./body.md), and at least one token matches the note's own
   text or its body. An ancestor's body never contributes to either test, so a
   crumb keeps meaning where the note lives. Results stay in
   [document order](./note-model.md#definitions). Matched tokens are highlighted
   wherever they occur — in the note label, an ancestor crumb, or the body preview.
6. Flat results are capped at the first ten matches in document order. When at
   least one match exists beyond the shown results, a non-interactive trailing
   row reports that more matches exist (the shown count, with no exact total) and
   prompts refining the query; it is not a result (no highlight, no arrow/hover
   target, excluded from listbox options).
7. `ArrowDown` highlights the next flat result.
8. `ArrowUp` highlights the previous flat result.
9. Arrow navigation stops at the first/last available note (no wraparound).
10. Pointer hover over a flat result highlights it, the same as arrow navigation
    (without moving focus out of the search box).
11. If flat results are empty, there is no highlighted note.
12. Search Mode ends when the search box loses focus.
13. `Enter` moves focus to the editor and [zooms](./zoom.md#visibility-and-editing-boundary) to the highlighted note.
14. `Escape` moves focus to the editor.
15. Search input exposes combobox semantics for assistive tech, including popup
    state and active descendant linkage.
16. Search results expose listbox semantics and mark the highlighted result as selected.
17. Each result's accessible name includes its body preview and its ancestor path
    context, so results that share the same note text are still distinguishable
    without sight, and a note matched on its body announces why (the same
    disambiguation the visible row provides).

## Result row context

Result rows carry enough structural context to tell apart matches that share the
same text. Every row uses the same layout regardless of highlight.

1. Every result row shows the matched note as a primary label line, a body
   preview when the note has a [body](./body.md), a dim
   ancestor-path subline beneath those, then a preview of the match's first two
   direct children.
2. The matched note's text is the primary label, and its text formatting is
   preserved (for example a checked note is struck through). The label shows no
   list marker — no bullet, number, or checkbox.
3. The body preview is a single line of plain text, shown whenever the matched
   note has a non-empty body. Hard line breaks and whitespace runs collapse to
   single spaces, and inline formatting is not preserved — unlike the label,
   since a windowed preview carries no formatting. When the query matches the
   body, the preview is a window around the first match, so the matched text is
   visible; other matches in the body may fall outside it. Otherwise it shows
   the body's opening. A `…` marks each end the window does not reach, and the
   window prefers whole words over an exact character budget.
4. The subline lists the full ancestor chain (excluding the matched note),
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
5. Ancestor crumbs are visually subordinate to the match — muted in colour and
   smaller, with an underline only on hover — so the matched note reads as the
   row's subject.
6. Every ancestor crumb is activatable; activating it zooms that ancestor and
   ends Search Mode, exactly like accepting a result.
7. The child preview shows the first two direct children of the match rendered
   with the outline's own list markers (bullet, number, or checkbox per child's
   list type, checked children struck through), matching how they look in the
   editor. A match with no children shows no preview; a match with more than two
   children indicates the remaining count.

## Future

- Richer query matching: fuzzy matching and result ranking.
