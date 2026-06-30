# Dates

## Purpose

Define RemDo-owned inline date behavior in the outliner.

## Core behavior

1. Dates are non-text inline RemDo nodes with a stored ISO date (`YYYY-MM-DD`)
   and a readable local label such as `Jun 10, 2026`.
2. `!` is an inline trigger character; its open/dismiss/confirm lifecycle is the
   shared one in [Editor popups](./popups.md). The rest of this spec
   is date-specific.
3. The only option is today's date (the user's local browser date), shown as the
   initial highlighted value. Typed query text is not interpreted in this phase
   (see Non-goals).
4. While the picker is open the calendar owns arrow-key navigation as its own
   focus mode — `ArrowUp`/`Down`/`Left`/`Right` move the active day rather than
   the editor caret, and the caret does not float free under a live grid. This is
   the shared lifecycle's per-picker key policy for the `!` picker (see
   [Editor popups](./popups.md)).
5. Confirming inserts a date node plus a trailing space over the pinned `!` span;
   with the highlighted day unmoved, that is today's date.
6. Clicking an existing date opens the picker in *edit* mode and updates that
   same node — this is opened from a committed token, not a trigger session, so
   the shared lifecycle does not apply.

## Atomic token keyboard behavior

1. A date node behaves as one atomic inline token. The caret must not appear
   inside the rendered date label while date-as-text editing is unsupported.
2. Arrow navigation across a date enters a whole-token selected/focused state
   instead of placing the caret inside the label.
3. `ArrowLeft` from immediately after a date selects the whole date token; the
   next `ArrowLeft` moves the caret before it.
4. `ArrowRight` from immediately before a date selects the whole date token; the
   next `ArrowRight` moves the caret after it.
5. `Enter` or `Space` on a selected/focused date token opens the date picker in
   edit mode.
6. `Escape` from a selected/focused date token clears the token focus and places
   the caret after the date without changing it.
7. `Backspace` immediately after a date selects the whole date token without
   deleting it; pressing `Backspace` again deletes the selected date.
8. `Delete` immediately before a date selects the whole date token without
   deleting it; pressing `Delete` again deletes the selected date.
9. `Backspace` or `Delete` on an already selected/focused date token deletes
   the whole date node.

## Non-goals / future

1. [Future] Let users edit a date node as ordinary text while preserving date
   identity when possible.
2. [Future] Support typed date queries or natural-language date parsing after
   `!`.

## References

1. Lexical custom nodes:
   <https://lexical.dev/docs/concepts/nodes>
2. WAI-ARIA Authoring Practices Guide, date picker dialog example (the calendar's
   grid focus and keys):
   <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/>
