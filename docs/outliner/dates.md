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
4. The picker starts in insert mode for a typed trigger and uses today's date as
   the initial highlighted value.
5. Choosing a date replaces the active `!` trigger with a date node followed by
   a trailing space.
6. Typing any query text after the `!` closes the picker and leaves the typed
   text unchanged.
7. `Enter` and `Tab` confirm the current picker date.
8. `Escape` closes the picker and keeps the typed `!` as editable text.
9. `Backspace` on an empty `!` trigger deletes that trigger and closes the
   picker.
10. Clicking outside the picker closes it without changing existing text or an
    existing date.
11. Clicking an existing date opens the picker in edit mode; choosing a new date
    updates the same date node.

## Non-goals / future

1. [Future] Let users edit a date node as ordinary text while preserving date
   identity when possible.
2. [Future] Support typed date queries or natural-language date parsing after
   `!`.

## References

1. Lexical React typeahead plugin:
   <https://lexical.dev/docs/react/plugins>
2. WAI-ARIA Authoring Practices Guide, combobox pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>
