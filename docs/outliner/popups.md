# Editor popups

## Purpose

Define the shared contract for RemDo's transient editor popups — the inline
trigger pickers (`@` for note [Links](./links.md), `!` for [Dates](./dates.md))
and the [Quick Action Menu](./menu.md) — and the trigger-picker session built on
it. Each per-popup spec defines only what differs: how it opens, the keys its
popup owns, its focus model, and what confirming does.

## Shared editor-popup contract

An editor popup is a transient surface anchored in the editor that, while open,
**owns the keyboard** and is **light-dismissable**. Each of RemDo's popups is a
specialization of this contract; the contract is independent of how each opens.

1. **One at a time.** At most one editor popup is open; opening one closes any
   other.
2. **The popup owns the keyboard.** While open it has first decision over every
   key: it consumes its navigation, commit, and dismissal keys, and no keystroke
   reaches ordinary text editing — **except** keys that edit the popup's own
   *pinned span* (see below). A popup with no pinned span owns every key; an
   owned key with no binding is a no-op.
3. **Editable-span exception.** A type-to-filter popup pins a span of editor text
   as its query; while the selection is inside that span, ordinary text-editing
   keys (printable characters, `Backspace`) stay the editor's and edit the query.
4. **Light-dismiss.** `Escape` and a pointer press outside the editor and popup
   both **cancel** — they close it and apply nothing. Commit happens only through
   an explicit per-widget commit action (each widget declares its commit keys);
   confirming applies the result and closes.
5. **`Tab` behavior is declared per widget**, as one of: **close and fall
   through** to the editor's normal `Tab` action (the popup closes, then
   deliberately routes the key onward), or
   **cycle within** the popup's own controls.
6. **Validated commit, safe restore.** Because the editor selection stays live
   while a popup is open (and may move under collaboration), a commit re-resolves
   its pinned target and verifies it still holds before applying. On any close the
   editor regains a valid selection restored from a model-level anchor (a node
   key, re-resolved at close), never a stale DOM range — caret after the inserted
   result on commit, back to the original caret on cancel.
7. **Focus model is per-widget.** A type-to-filter popup keeps DOM focus in the
   editor and tracks its active item via `aria-activedescendant` (the WAI-ARIA
   combobox pattern); a structured chooser (calendar grid, menu) may instead move
   focus into itself with roving focus. The keyboard-ownership and dismissal rules
   above hold either way.

## The trigger session (`@` and `!`)

The `@` and `!` pickers are opened by typing a trigger character. Each is a
**session anchored to the span of that keypress** — the trigger character and the
text after it, fixed at open time. The session is never re-derived from where the
caret later sits, so a picker never retargets onto a different trigger or onto
text the user did not freshly invoke.

1. **Open.** A picker opens only on a fresh keypress of its trigger character at a
   boundary — the start of note text, after whitespace, after opening punctuation
   (`(`, `[`, `{`), or after an atomic inline token (a decorator node such as a
   date). So `done!` and `a@b` stay plain text, and moving the caret back beside an
   already-typed trigger never reopens the picker.
2. **Editable query (`@` only).** The `@` picker treats its span as a live query:
   per the editable-span exception, ordinary typing and `Backspace` edit the text
   after `@` and refilter. The `!` picker has no query — it opens its calendar
   immediately (see [Dates](./dates.md)), so typing after `!` is not query text.
3. **Dismiss.** Besides the shared light-dismiss, the `@` picker also closes when
   the caret leaves its span — an `ArrowLeft`/`ArrowRight` out of it or into its
   middle — leaving the typed trigger and query as ordinary text; deleting back
   past the `@` ends the session because the span no longer holds it. (The `!`
   calendar traps focus, so the caret cannot move while it is open.)

The per-picker specs define the rest: the option source and popup body, the keys
the popup additionally owns, the focus model, and the commit. Behavior over an
*already-committed* inline token (navigating or editing it) is not part of this
session and stays in the owning feature (see [Dates](./dates.md) for date-token
keyboard behavior).

## References

1. WAI-ARIA Authoring Practices Guide, combobox pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>
2. WAI-ARIA Authoring Practices Guide, date picker dialog example:
   <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/>
3. WAI-ARIA Authoring Practices Guide, menu button pattern:
   <https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/>
