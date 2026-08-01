# View header

A document view presents and edits its current location in a header above the
location's children. The view header is present in every document view and does
not apply to [Home](./home.md), which has no outline.

## Content

The view header renders the current location's own content as an editable
heading. Editing the heading changes that content in place.

The location's [note kind](./note-model.md#note-kinds) determines the content it
can carry. A zoomed editor note supports the same inline content as any editor
note, including formatting and [note links](./links.md). The document root
supports the content allowed by its kind.

## Structural boundary

The header is visually distinct from editor-note rows and is not one of them.
It cannot be folded, indented, outdented, reordered, structurally deleted, or
selected structurally, and structural commands do not target it.

## Editing

1. `Enter` creates an empty first child of the current location and moves the
   caret into it.
2. When the location's kind can own a [body](./body.md), `Shift+Enter` focuses
   that body and creates it when absent.
3. An owned body appears below the header and above the children. It follows
   the body contract; moving down from the header instead enters the first
   child.
4. `Backspace` at the start of the header is a no-op.
