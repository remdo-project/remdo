# Inline trigger pickers

## Purpose

Define the one lifecycle shared by RemDo's inline "trigger character" pickers —
the keyboard-first menus opened by typing a trigger in note text (`@` for note
[Links](./links.md), `!` for [Dates](./dates.md)). This page is the single source
for that lifecycle; each per-trigger spec defines only what differs: its option
source, its popup, and what confirming inserts. Each picker is one instance of
the WAI-ARIA [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

## Lifecycle

1. **Open.** A picker opens only on a fresh keypress of its trigger character at
   a boundary — the start of note text, after whitespace, or after opening
   punctuation (`(`, `[`, `{`). So `done!` and `a@b` stay plain text, and moving
   the caret back beside an already-typed trigger never reopens the picker.
2. **Query.** While open, the text between the trigger and the caret is the live
   query (it may be empty). When the option list is non-empty it always has one
   active option (initially the first in the source's order).
3. **Navigate.** `ArrowDown`/`ArrowUp` move the active option, clamped at the
   ends (no wrap); pointer hover moves it to the hovered row.
4. **Confirm.** `Enter`, `Tab`, or a primary-button click on a row replaces the
   trigger-and-query span with the trigger's committed result plus a trailing
   space, and closes. On a no-results popup these close the picker and leave the
   typed text unchanged.
5. **Dismiss.** `Escape`, a pointer press outside the editor and picker, or
   editor blur close the picker and leave the typed trigger and query as ordinary
   text. The picker never deletes text on the user's behalf — `Backspace` is just
   editing (deleting back past the trigger ends the session because the match is
   gone). A mistaken trigger is removed with ordinary editing keys.

Accessibility follows the combobox pattern: the active option is exposed via the
listbox's `aria-activedescendant`, and selectable rows via `aria-selected`. Per
APG, closing on `Escape` without clearing the text is the expected default.

## Scope

The shared engine owns this lifecycle; per-trigger plugins supply only their
small spec. Behavior over an *already-committed* inline token — navigating or
editing it — is not part of this lifecycle and stays in the owning feature (see
[Dates](./dates.md) for date-token keyboard behavior).
