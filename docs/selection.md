# Selection

This document captures the cursor-driven selection model used throughout RemDo.
All structural commands depend on these guarantees, so they serve as the
contract for both UX and implementation. The structural outcomes produced by
these selections are detailed in
[Note Structure Rules](./note-structure-rules.md).

## Whole-Note Selection

Selections in the editor are constrained such that you cannot partially select
across note boundaries. If a text selection extends beyond the content of a
single note into another note, the selection is immediately expanded to
encompass whole notes (and, if applicable, entire subtrees). This ensures that
any structural operation acts on complete notes rather than fragments.

1. It is acceptable to select text within a single note (for example part of a
   note’s content or all of the content of one note). You can edit content
   freely inside one note without triggering structural snaps.
2. Whenever a selection would span multiple notes—such as dragging from the end
   of one note into its child or into the next sibling—the editor snaps the
   selection to cover the full notes involved. The parent note and all its
   children become fully selected rather than allowing a half-in/half-out range.
3. Because selections always align to note boundaries, every structural command
   can assume it is operating on entire subtrees, keeping collaboration and undo
   behavior deterministic.

**Example:** Highlight text starting in `note1` and continue dragging into
`note2`. Instead of ending up with a partial selection, the editor expands the
selection to include both notes entirely. The same applies when the drag crosses
between a parent and child: the entire parent note (and its subtree) becomes the
selection.

## Selection States

Selection is always in exactly one of the following states:

1. **Caret / Text Range:** The user is editing within a single note. Inline
   formatting, typing, and deletion operate on that range only.
2. **Note Range (contiguous):** Any selection that includes entire notes—whether
   it covers a single note or several siblings—forms a contiguous slice of the
   outline. The stored order always matches their tree order at the moment of
   selection.

RemDo intentionally limits selection to contiguous ranges; there is no
non-contiguous toggling.

### Editing vs. Structural Mode

Typing only inserts characters while the selection is a caret or inline text
range. As soon as a selection covers any whole note (even just the note without
its children), the editor switches to structural mode: keystrokes that would
normally type become no-ops, and only structural commands (indent, outdent,
reorder, duplicate, delete, etc.) respond. Press `Enter` or click back into a
note’s text to return to inline editing.

## Cursor-Driven Gestures

### Keyboard Gestures

1. `Shift+Arrow` behaves like a regular text editor while the caret stays inside
   the current note. Once the extension would cross a note boundary, RemDo snaps
   the selection to whole notes and follows the Progressive Selection ladder:
   entire note → note plus descendants → siblings at the same depth (and their
   descendants) → parent, and so on toward the root. `Shift+Up/Down` walk across
   siblings before escalating upward, while `Shift+Left/Right` traverse between
   a note and its parent/child when those relationships exist.
2. `Esc` (or clicking back into text) collapses any note-range selection to the
   caret state without changing the document, giving you a quick way to resume
   typing after structural commands.

### Pointer Gestures

1. Dragging within text highlights normally until the drag crosses into another
   note, at which point the selection snaps to whole notes per the invariant
   above.
2. `Shift+Click` extends the existing selection from its anchor to the clicked
   note, producing a contiguous note range that follows the same progression stages
   as keyboard-driven selection, regardless of whether the original anchor came
   from keyboard or mouse input.

### Touch Gestures

1. Long-pressing within a note enters caret selection mode. Dragging handles
   within the note behaves like desktop text selection until the range crosses a
   note boundary, where it snaps to whole notes.

## Shortcut Summary

| Shortcut / Gesture | Context | Effect |
| ------------------ | ------- | ------ |
| `Tab`              | Structural | Indents the selected note range under the preceding sibling (see [Note Structure Rules](./note-structure-rules.md)). |
| `Shift+Tab`        | Structural | Performs Structural Outdent, inserting the selection immediately after its former parent. |
| `Shift+Arrow`      | Keyboard | Extends the selection; once it crosses a note boundary it follows the Progressive Selection ladder. |
| `Shift+Click`      | Pointer  | Extends from the anchor to the clicked note, yielding a contiguous note range. |
| `Esc`              | Keyboard | Collapses any note range back to a caret without changing content. |
| `Enter`            | Keyboard | Returns to inline editing by placing the caret inside the focused note. |
| `Cmd/Ctrl+A`       | Keyboard | Advances the Progressive Selection ladder one stage per press. |

## Progressive Selection

`Cmd/Ctrl+A` escalates selection scope without leaving the keyboard. Each press
advances to the next level; any other navigation or edit resets the progression
back to stage 1.

1. **Press 1:** Selects only the current note’s inline content (standard select
   all inside the caret note).
2. **Press 2:** Wraps the entire note body. Structural commands always operate
   on the note as a subtree, so indenting/outdenting still carries any children
   even though the highlight shows only the parent note.
3. **Press 3:** Extends to the note plus all of its descendants so clipboard
   operations (copy, duplicate, delete) explicitly include the full subtree.
4. **Press 4:** Adds every sibling at the same depth (including their
   descendants) while keeping the parent untouched.
5. **Press 5:** Picks up the parent note and all of its descendants, effectively
   covering the entire local subtree above the original note.
6. **Press 6 and beyond:** Repeat the sibling-then-parent climb for each higher
   level until the root note becomes selected.

Stopping at any stage leaves the selection in that scope so you can immediately
run structural commands or copy/paste entire sections. `Shift+Arrow` uses this
same progression whenever it pushes the selection across a note boundary, so
keyboard-driven selection stays coherent regardless of the shortcut you use.

## Command Compatibility

| Selection state                    | Allowed operations                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Caret / Text Range                 | Typing, inline formatting, inline delete/backspace, inline to-do toggles                                 |
| Note Range (single or contiguous)  | Indent/outdent, reorder, duplicate, convert note type, delete, copy/paste entire notes, run structural commands (always executed in document order) |

Progressive Selection is simply a shortcut for creating larger note ranges, so
it inherits the same command surface. These guarantees ensure upcoming tests
and implementations can reason about the selection state without peeking into
UI-specific details.
