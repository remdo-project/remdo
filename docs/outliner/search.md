# Search

## Purpose

Define keyboard-first navigation from the search input: current text search
behavior and the planned slash-prefixed navigation flow.

## Terms

- **Search Mode:** active while the search box has focus.
- **Highlighted note:** the single note currently targeted by search navigation.
- **Slash navigation mode:** input mode entered when query starts with `/`;
  intended for quick tree navigation rather than text matching.
- **Inline completion:** a non-committed ghost suggestion shown inside
  the search input that can be accepted as typed text.
- **Result row:** the rendering for a single search result — an ancestor
  breadcrumb (ending in the matched note) plus a preview of its first children.
  Every result uses this same layout; highlighting only restyles a row, it does
  not change its shape.

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
6. Typing in the search box filters flat results to notes whose text matches
   the query text (plain text match; no fuzzy matching).
7. `ArrowDown` highlights the next flat result.
8. `ArrowUp` highlights the previous flat result.
9. Arrow navigation stops at the first/last available note (no wraparound).
10. If flat results are empty, there is no highlighted note.
11. Search Mode ends when the search box loses focus.
12. `Enter` moves focus to the editor and zooms to the highlighted note.
13. `Escape` moves focus to the editor.
14. If the query starts with `/`, Search Mode switches to slash navigation
    semantics.
15. In slash navigation, query filtering applies only to the segment after the
    last `/`.
16. In slash navigation, visible query text is the active filter source;
    displayed results must always match that visible segment filter.
17. Slash navigation shows top-level document notes as candidates at the root
    level.
18. In slash navigation, appending another `/` after an exact segment match
    descends into that note and switches candidates to its direct children.
19. In slash navigation, cycling highlighted candidates with arrow keys updates
    only highlight; it does not mutate visible query text.
20. In slash navigation, pressing `Enter` on exact `/` zooms to document root.
21. In slash navigation with any deeper slash path, pressing `Enter` zooms to
    the highlighted candidate.
22. Invalid completed slash paths (for example `/missing/` or
    `/parent/missing/`) show no matches and must not fall back to ancestor or
    root candidates.
23. Inline completion appears only while search input is focused and completion
    text is non-empty.
24. Inline completion is hidden while IME composition is active, when selection
    is non-collapsed, or when caret is not at input end.
25. While Search Mode is active, the static `Search` placeholder is hidden to
    avoid visual overlap with inline completion.
26. For empty query, inline completion text is `/`.
27. For non-empty non-slash query text, inline completion is hidden.
28. In slash mode, inline completion source candidate is highlighted candidate
    when present, otherwise first visible slash candidate.
29. In slash mode, if current segment is a prefix of source note text, inline
    completion text is the remaining suffix.
30. In slash mode, if current segment exactly matches source note text:
    - inline completion is `/` when source note has children;
    - inline completion is hidden when source note has no children.
31. `ArrowRight` accepts inline completion by appending only suggested text to
    current input and does not trigger zoom.
32. Inline completion may display symbolic shortcut hint metadata (for example
    `→`), but hint is not inserted text.
33. Search input exposes combobox semantics for assistive tech, including popup
    state and active descendant linkage.
34. Search results expose listbox semantics and mark the highlighted result as
    selected.
35. In slash-navigation flat results, non-leaf notes show a muted `/...` suffix
    hint; leaf notes show no suffix. In text-search results the child preview
    (see Result row context) conveys children instead, so no `/...` suffix
    appears there.

## Result row context

Result rows carry enough structural context to tell apart matches that share the
same text, without zooming into one (which ends Search Mode). Every row uses the
same layout regardless of highlight, so moving the highlight only restyles the
selected row and never re-lays-out the list.

1. Every result row shows an ancestor breadcrumb whose final crumb is the matched
   note itself, followed by a preview of the match's first two direct children.
2. The matched query term is highlighted within the matched note's text in the
   breadcrumb's final crumb.
3. The breadcrumb lists the ancestor chain from the document root down to and
   including the matched note, and always stays on a single line. It fits the
   line under a combined budget that sacrifices depth before width:
   - **Depth.** The first and last crumbs (root context and the matched note) are
     always kept. When the chain exceeds four crumbs the middle collapses to a
     single `⋯` crumb between the first two and last two; the `⋯` crumb exposes
     the hidden crumb labels (in order) as a tooltip.
   - **Width.** Crumbs share the available row width: each shrinks and overflows
     with an ellipsis rather than wrapping, so the breadcrumb uses more of a wide
     results pane and tightens on a narrow one (adjusting on resize). The matched
     (last) crumb shrinks last, keeping the most disambiguating crumb readable. A
     crumb truncated by width exposes its full label as a tooltip.
4. Every ancestor crumb (not the final match crumb) is activatable; activating it
   zooms that ancestor and ends Search Mode, exactly like accepting a result.
5. Each result note renders with the outline's own list markers — bullet, number,
   or checkbox per its list type, and a checked note struck through — so a result
   reads as it does in the editor. The matched note's crumb carries this state.
6. The child preview shows the first two direct children of the match with the
   same outline rendering as rule 5. A match with no children shows no preview; a
   match with more than two children indicates the remaining count.
7. Result row context is sourced from the active document's search candidates and
   appears only once those candidates are available.
