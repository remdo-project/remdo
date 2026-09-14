# Open document session

An open document session is the adapter-neutral contract between consumers and
one opened document. It exposes [editor notes](./note-model.md#note-kinds), [search](./search.md),
action capabilities, and semantic operations. The application host owns its
lifetime and exposes it only while the committed document is usable. Each
operation's behavioral owner retains its semantics.

[SDK design](../../dev/sdk.md) owns contributor guidance and external design references.

## State and observation

The session resolves editor notes by document-local note ID; cross-document
identity for addressable editor notes uses the global
[`noteAddress`](./note-ids.md#definitions). Creating a live reference neither requires the note to exist nor
creates it. Value and capability reads resolve the current committed note; an
unavailable note or source produces an identifiable unavailable-note error,
distinct from unexpected read failures.

Informative: A retained reference stays useful across edits and deletion/undo.
Its values are fresh when read; previously returned values do not update
themselves.

Observation is scoped to an addressed note or action
capabilities and signals that the relevant state should be reread. Addressed
references are readable without subscribing. Each addressed subscription is
independent, can be released repeatedly, and may remain active through
unavailability or a failed read to observe recovery. Notifications include
changes in readability. Observable capability
states distinguish unavailable, failed, and ready values; every ready value is an
immutable, coherent revision. Listeners may safely invoke session operations.
Addressed-note observation includes changes to semantic eligibility, including
those caused by a change of [zoom boundary](./zoom.md#definitions), even without a content edit.

## Operations and ownership

Mutations target an addressed note, the currently focused note, the current
selection, the current view, or document history. They resolve and validate their
targets when executed and no-op when the source or target is unavailable. Edits
obey the current [zoom editing boundary](./zoom.md#visibility-and-editing-boundary). An asynchronous mutation rejects on
unexpected execution failure and resolves after its resulting local update
commits, without waiting for listener delivery, collaboration, or persistence.

Addressed checked toggling applies [List types' subtree semantics](./list-types.md#toggling) to that note
independently of selection. Selection checked toggling uses the current selection,
or the [menu's checked-target rule](./menu.md#actions) when supplied a note target.

Adapters own framework and storage mechanics. Consumer surfaces own which
operations they offer and how they present and interact with them.
