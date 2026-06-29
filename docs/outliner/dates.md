# Dates

## Purpose

Define RemDo-owned inline date behavior in the outliner.

## Core behavior

1. Dates are non-text inline RemDo nodes with a stored ISO date (`YYYY-MM-DD`)
   and a readable local label such as `Jun 10, 2026`.
2. `!` is an inline trigger character; its open/dismiss/confirm lifecycle is the
   shared one in [Inline trigger pickers](./triggers.md). The rest of this spec
   is date-specific.
3. The picker has two modes. It opens in **list mode**: a one-dimensional list of
   relative-date presets — `Today` (initially active), `Tomorrow`, `Next week`,
   and a final `Pick date…` row. List mode is a plain instance of the shared
   lifecycle (no extra keys of its own).
4. `Enter` on a relative-date preset commits that date. So the fast path is `!`
   then `Enter` → today, with no calendar shown. Typed query text after `!` is
   not interpreted in this phase (see Non-goals), so the presets are the only way
   to choose without the calendar.
5. `Enter` (or click) on `Pick date…` enters **calendar mode**: a month grid that
   owns the arrow keys as its own focus mode — `ArrowUp`/`Down`/`Left`/`Right`
   move the active day, `Enter` chooses it, and `Escape` leaves calendar mode
   (back to list mode) without changing anything. Calendar mode is a coherent
   focus/ARIA mode, not the editor caret floating under a live grid.
6. Confirming (from either mode) inserts a date node plus a trailing space over
   the pinned `!` span.
7. Clicking an existing date opens the picker directly in **edit** mode (the same
   calendar) and updates that node — this is opened from a committed token, not a
   trigger session, so the shared lifecycle does not apply.

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
2. [Future] Support typed natural-language date parsing after `!` (for example
   `!tomorrow` or `!next fri`), resolving the query directly and demoting the
   preset list and calendar to fallbacks. This is the highest-leverage follow-up;
   the current preset list is the keyboard-fast bridge until it ships.

## Guideline notes

1. WAI-ARIA APG date picker dialog says opening the picker moves focus to the
   selected or current date, and in the date grid: "`Right Arrow` Moves focus to
   the next day."
2. The same APG date picker example says "`ESC` Closes the dialog" and
   "`Space`, `Enter`" select the date and close the dialog.
3. WAI-ARIA APG grid pattern says grid widgets use "directional navigation
   keys" and that `Right Arrow` / `Left Arrow` move focus between cells.
4. WAI-ARIA APG combobox grid popup says `Enter` accepts the selected value,
   `Escape` closes the popup, and arrow keys move focus in the grid.

## References

1. Shared inline trigger lifecycle: [Inline trigger pickers](./triggers.md).
2. Lexical React typeahead plugin:
   <https://lexical.dev/docs/react/plugins>
3. Lexical custom nodes:
   <https://lexical.dev/docs/concepts/nodes>
4. WAI-ARIA Authoring Practices Guide, combobox pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>
5. WAI-ARIA Authoring Practices Guide, date picker dialog example:
   <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/>
6. WAI-ARIA Authoring Practices Guide, date picker combobox example:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/>
7. WAI-ARIA Authoring Practices Guide, grid pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/grid/>
8. U.S. Web Design System date picker:
   <https://designsystem.digital.gov/components/date-picker/>
9. Material UI chip accessibility:
   <https://mui.com/material-ui/react-chip/>
