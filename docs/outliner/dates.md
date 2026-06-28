# Dates

## Purpose

Define RemDo-owned inline date behavior in the outliner.

## Core behavior

1. Dates are non-text inline RemDo nodes with a stored ISO date (`YYYY-MM-DD`)
   and a readable local label such as `Jun 10, 2026`.
2. `!` is an inline trigger character; its open/close/confirm lifecycle is the
   shared one in [Inline trigger pickers](./triggers.md). The rest of this spec
   is date-specific.
3. The only option is today's date (the user's local browser date), shown as the
   initial highlighted value. Typed query text is not interpreted in this phase
   (see Non-goals).
4. Confirming inserts a date node plus a trailing space; with the selection
   unmoved, that is today's date.
5. Clicking an existing date opens the picker in *edit* mode and updates that
   same node — this is opened from a committed token, not a trigger session.

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
3. [Future] When the date picker is open, let the picker own calendar
   navigation keys instead of letting arrow keys move the editor caret or date
   token. The intended direction is: arrow keys move the active day, `Enter` or
   `Space` chooses it, `Escape` closes without changing the date, and
   `Backspace`/`Delete` do not mutate editor content while picker interaction is
   active.
4. [Future] Decide whether the RemDo picker is modeled as a dialog-style date
   picker or a combobox grid popup, then align focus management and `Tab`
   behavior with that chosen pattern.

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
