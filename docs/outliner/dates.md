# Dates

## Purpose

Define RemDo-owned inline date behavior in the outliner.

## Core behavior

1. Dates are inline RemDo nodes with a stored ISO date (`YYYY-MM-DD`) and a
   readable local label such as `Jun 10, 2026`.
2. Typing `!` opens the date picker only at a typeahead boundary: the start of
   note text, after whitespace, or after opening punctuation (`(`, `[`, `{`).
3. Typing `!` after non-whitespace prose does not open the picker, so ordinary
   punctuation like `done!` remains plain text.
4. The picker starts in insert mode for a typed trigger and uses today's date in
   the user's local browser date as the initial highlighted value.
5. Choosing a date replaces the active `!` trigger with a date node followed by
   a trailing space.
6. Typing any query text after the `!` closes the picker and leaves the typed
   text unchanged.
7. `Enter` and `Tab` confirm the current picker date. If the user has not moved
   the picker selection, this inserts today's date.
8. `Escape` closes the picker and keeps the typed `!` as editable text.
9. `Backspace` on an empty `!` trigger deletes that trigger and closes the
   picker.
10. Clicking outside the picker closes it without changing existing text or an
    existing date.
11. Clicking an existing date opens the picker in edit mode; choosing a new date
    updates the same date node.

## Future atomic token keyboard behavior

1. [Future] A date node should behave as one atomic inline token. The caret
   should not appear inside the rendered date label while date-as-text editing
   is unsupported.
2. [Future] Arrow navigation across a date should enter a whole-token
   selected/focused state instead of placing the caret inside the label.
3. [Future] `ArrowLeft` from immediately after a date should select the whole
   date token; the next `ArrowLeft` should move the caret before it.
4. [Future] `ArrowRight` from immediately before a date should select the whole
   date token; the next `ArrowRight` should move the caret after it.
5. [Future] `Enter` or `Space` on a selected/focused date token should open the
   date picker in edit mode.
6. [Future] `Escape` from a selected/focused date token should clear the token
   focus and return to the nearest caret position without changing the date.
7. [Future] `Backspace` immediately after a date should select the whole date
   token without deleting it; pressing `Backspace` again should delete the
   selected date.
8. [Future] `Delete` immediately before a date should select the whole date
   token without deleting it; pressing `Delete` again should delete the selected
   date.
9. [Future] `Backspace` or `Delete` on an already selected/focused date token
   should delete the whole date node.

## Non-goals / future

1. [Future] Let users edit a date node as ordinary text while preserving date
   identity when possible.
2. [Future] Support typed date queries or natural-language date parsing after
   `!`.

## References

1. Lexical React typeahead plugin:
   <https://lexical.dev/docs/react/plugins>
2. Lexical node modes:
   <https://lexical.dev/docs/concepts/nodes>
3. WAI-ARIA Authoring Practices Guide, combobox pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>
4. WAI-ARIA Authoring Practices Guide, date picker dialog example:
   <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/>
5. WAI-ARIA Authoring Practices Guide, date picker combobox example:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/>
6. U.S. Web Design System date picker:
   <https://designsystem.digital.gov/components/date-picker/>
7. Material UI chip accessibility:
   <https://mui.com/material-ui/react-chip/>
