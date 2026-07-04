# Dates

## Purpose

Define RemDo-owned inline date behavior in the outliner.

## Core behavior

1. Dates are non-text inline RemDo nodes with a stored ISO date (`YYYY-MM-DD`)
   and a readable local label such as `Jun 10, 2026`.
2. `!` is an inline trigger character; its open/dismiss/confirm lifecycle is the
   shared one in [Editor popups](./popups.md). The rest of this spec
   is date-specific.
3. The `!` picker is a **modal calendar dialog**: opening it moves focus into a
   month-grid calendar (the shared contract's per-widget trapping focus model),
   with today (the user's local browser date) preselected. Typed query text is
   not interpreted (see Non-goals / future), so the calendar is the only way to
   choose.
4. The calendar owns its keyboard while open: `ArrowLeft`/`Right` move by a day,
   `ArrowUp`/`Down` by a week, `Home`/`End` to the start/end of the week,
   `PageUp`/`PageDown` by a month, `Shift+PageUp`/`PageDown` by a year. The editor
   caret does not move under the open grid.
5. `Enter` or `Space` commits the focused day; a primary-button click commits the
   clicked day. So `!` then `Enter` inserts today (the fast path). `Escape` — and
   `Tab`, which must not escape into browser focus traversal — cancel the calendar
   and restore the caret to the editor. Committing inserts a date node plus a
   trailing space over the pinned `!` span.
6. Clicking, or `Enter`/`Space` on a selected date token, opens the same calendar
   in *edit* mode over that node. It is opened from a committed token rather than a
   trigger session, so the trigger lifecycle does not apply, but the in-calendar
   keyboard contract is identical (focus moves into the grid; the keys in 4–5
   navigate and commit; commit updates the node and places the caret after it,
   cancel leaves it unchanged).

## Atomic token keyboard behavior

1. A date node behaves as one atomic inline token. The caret must not appear
   inside the rendered date label (date-as-text editing is a Future direction).
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
3. [Future] Give the calendar its own chrome (month/year navigation controls) and
   have `Tab` cycle those controls within the dialog instead of cancelling —
   there are no controls to cycle to, so `Tab` cancels (see 5).

## References

1. WAI-ARIA Authoring Practices Guide, date picker dialog example (the calendar's
   grid focus and keys):
   <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/>
