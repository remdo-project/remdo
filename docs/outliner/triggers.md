# Inline trigger pickers

## Purpose

Define the one lifecycle shared by RemDo's inline "trigger character" pickers —
the keyboard-first menus opened by typing a trigger in note text (`@` for note
[Links](./links.md), `!` for [Dates](./dates.md)). This page is the single source
for that lifecycle; each per-trigger spec defines only what differs: its option
source, its popup, the keys its popup owns, and what confirming inserts. The popup
follows the WAI-ARIA
[combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) while DOM
focus stays in the note text.

## The pinned session

A picker is a **session pinned to the span of the trigger keypress that opened
it** — the trigger character and the run of text after it, fixed at open time. The
session is never re-derived from where the caret later sits; it tracks only that
one originating span. This is the core invariant: **a picker never retargets onto a
different trigger or onto text the user did not freshly invoke.**

## Lifecycle

1. **Open.** A picker opens only on a fresh keypress of its trigger character at a
   boundary — the start of note text, after whitespace, after opening punctuation
   (`(`, `[`, `{`), or after an atomic inline token (a decorator node such as a
   date). So `done!` and `a@b` stay plain text, and moving the caret back beside an
   already-typed trigger never reopens the picker.
2. **Query.** While open, the query is the text of the pinned span after the
   trigger character (it may be empty). Editing within the span updates the query;
   the active option list stays in sync, and when non-empty it always has one
   active option (initially the first in the source's order).
3. **Navigate.** The popup owns `ArrowUp`/`ArrowDown` (move the active option,
   clamped at the ends, no wrap) and pointer hover. It does **not** own
   `ArrowLeft`/`ArrowRight`: horizontal caret keys, printable keys, and
   `Backspace` are ordinary editing. A per-picker popup may own additional keys
   when it has a distinct mode (see [Dates](./dates.md) for the calendar's grid
   navigation).
4. **Confirm.** `Enter` or a primary-button click on a row replaces the pinned
   span with the trigger's committed result plus a trailing space, and closes —
   after re-checking that the pinned span is still intact. On a no-results popup,
   `Enter` closes the picker and leaves the typed text unchanged. `Tab` does not
   confirm: it closes the picker and falls through to its normal outliner action
   (for example indent), leaving the typed text in place.
5. **Dismiss.** The picker closes, leaving the typed trigger and query as ordinary
   text, when: `Escape` is pressed; the caret leaves the pinned span (an
   `ArrowLeft`/`ArrowRight` out of it, or into the middle of it, or a click
   elsewhere); a pointer press lands outside the editor and picker; or the editor
   loses focus. The picker never deletes text on the user's behalf — `Backspace`
   is ordinary editing, and deleting back past the trigger ends the session
   because the span no longer holds the trigger.

Accessibility follows the combobox pattern: the active option is exposed via the
popup's `aria-activedescendant`, and selectable rows via `aria-selected`. Per APG,
closing on `Escape` without clearing the text is the expected default. A popup
that enters a distinct sub-mode owning its own keys (the date calendar grid) gives
that mode coherent focus and ARIA semantics rather than silently swallowing keys.

## Scope

The shared engine owns this lifecycle — the pinned session, open/dismiss/confirm,
anchor and portal, the single-active-picker rule, and commit validation. A
per-trigger plugin supplies only its option source, its popup, the keys that popup
owns, and the commit. Behavior over an *already-committed* inline token —
navigating or editing it — is not part of this lifecycle and stays in the owning
feature (see [Dates](./dates.md) for date-token keyboard behavior).
