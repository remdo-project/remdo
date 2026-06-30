# Editor popups

## Purpose

Define the shared contract for RemDo's transient editor popups — the inline
trigger pickers (`@` for note [Links](./links.md), `!` for [Dates](./dates.md))
and the [Quick Action Menu](./menu.md) — and the trigger-picker lifecycle built on
it. This page is the single source for the shared contract and that lifecycle;
each per-popup spec defines only what differs: how it opens, the keys its popup
owns, and what confirming does. The trigger pickers' popup follows the WAI-ARIA
combobox pattern.

## Shared editor-popup contract

RemDo's transient editor popups — the trigger pickers here and the quick action
menu (see [Quick Action Menu](./menu.md)) — share one interaction contract,
independent of how each is opened:

1. **At most one is open at a time.** Opening one closes any other; an action
   that would open a second while one is open is ignored or replaced, never
   stacked.
2. **The popup owns its navigation keys while open** — `ArrowUp`/`ArrowDown` move
   its active item, `Enter` activates it, `Escape` closes it — without moving DOM
   focus out of the editor (active item exposed via `aria-activedescendant`). Keys
   the popup does not claim remain ordinary editing.
3. **It closes when the editor interaction moves on:** `Escape`, a pointer press
   outside the editor and popup, the editor losing focus, or the editor selection
   moving away from what anchors the popup. Closing never mutates document
   content on the user's behalf.

The trigger pickers extend this contract with a typed-trigger session (below);
the quick action menu extends it with its own entry gestures and actions.

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
3. **Navigate.** On top of the shared navigation keys, a picker does **not** own
   `ArrowLeft`/`ArrowRight`: horizontal caret keys, printable keys, and
   `Backspace` stay ordinary editing (so a horizontal move out of the span
   dismisses, below). `ArrowUp`/`ArrowDown` are clamped (no wrap). A per-picker
   popup may own more keys in a distinct mode (see [Dates](./dates.md) for the
   calendar grid).
4. **Confirm.** `Enter` or a primary-button click on a row replaces the pinned
   span with the trigger's committed result plus a trailing space, and closes. On
   a no-results popup, `Enter` just closes and leaves the typed text unchanged.
   `Tab` does not confirm: it closes the picker and falls through to its normal
   outliner action (for example indent), leaving the typed text in place.
5. **Dismiss.** Beyond the shared close triggers, the picker also closes when the
   caret leaves the pinned span — an `ArrowLeft`/`ArrowRight` out of it or into
   its middle. Dismissal leaves the typed trigger and query as ordinary text;
   `Backspace` is ordinary editing, and deleting back past the trigger ends the
   session because the span no longer holds the trigger.

A per-picker sub-mode that owns its own keys (the date calendar grid) gives that
mode coherent focus semantics rather than silently swallowing keys.

## Scope

The shared engine owns the contract and lifecycle above — the pinned session,
anchoring, and commit validation. A per-trigger plugin supplies only its option
source, its popup, the keys that popup owns, and the commit. Behavior over an
*already-committed* inline token — navigating or editing it — is not part of this
lifecycle and stays in the owning feature (see [Dates](./dates.md) for date-token
keyboard behavior).

## References

1. WAI-ARIA Authoring Practices Guide, combobox pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>
