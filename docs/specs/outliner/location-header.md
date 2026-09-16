# Location header

The location header identifies the current destination above its contents. It is
present on [Home](./home.md) and in every document view, separately from ancestor
[breadcrumb navigation](./zoom.md#breadcrumbs).

## Content

The header presents the current location as the page heading. Its content and
editing depend on the location:

- Home displays the read-only heading **Home**.
- A [document root](./note-model.md#definitions) displays its own text as a read-only document name.
  [Rename](#document-rename) changes that name through an explicit submission.
- A zoomed [editor note](./note-model.md#note-kinds) displays its own rich content as an editable heading. It
  supports the same inline content as any editor note, including formatting and
  [note links](./links.md). Edits apply in place through ordinary document editing, without a
  separate draft or submit step.

Editable content and heading semantics remain separately exposed to assistive technology.

## Actions

A document view's header has a [quick action menu](./menu.md) button. Home actions follow [Home](./home.md#document-actions).

## Document rename

Rename follows [Document Access](../access/access-control.md#document-access) and changes only the document name.

- **Draft.** **Rename…** opens a dialog with the current name selected in a
  plain-text input. Edits stay local; remote changes leave the draft intact.
  **Cancel**, `Escape`, or dismissal discards it unless submission is pending.
- **Validation.** Submission trims leading and trailing whitespace, preserves
  interior whitespace, and rejects an empty result with an inline error. Names
  need not be unique.
- **Submission.** **Rename** or `Enter` submits the complete name; the unchanged
  opening name closes the dialog without a write. While pending, editing,
  dismissal, and repeat submission are blocked. Success closes the dialog;
  failure retains the draft and shows an error for explicit retry.
- **Commit.** Submission requires acceptance by the server that owns the document;
  an unavailable source retains the draft for retry without queuing the rename.
  Concurrent renames resolve to the last server-committed whole name. Users with
  access see it in open document views and lists after synchronization.
- **Return.** Closing follows the [menu's focus restoration](./menu.md#behavior) and preserves the
  current destination and Home browsing position when still available.

## Structural boundary

The header is visually distinct from editor-note rows and is not one of them.
It cannot be folded, indented, outdented, reordered, structurally deleted, or
selected structurally, and structural commands do not target it. Selection
extension cannot cross from the header, its owned body, or the child outline
into either of the other two; it stops at that boundary. Within the child
outline, [whole-note snapping](./selection.md#whole-note-snapping) applies.

## Editor-note editing

In a zoomed editor note's editable heading, `Enter` creates an empty first child
and moves the caret into it. `Backspace` at the start is a no-op.

An owned [body](./body.md) appears between the header and its children and follows the
body contract for creation, focus, and navigation.
