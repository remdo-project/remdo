# Open document

An open document is the adapter-neutral contract between consumers and
one opened [editor document](./note-model.md#definitions). It exposes the [document root](./note-model.md#definitions), [editor notes](./note-model.md#note-kinds), [search](./search.md),
action capabilities, and semantic operations. The application host owns its
lifetime and exposes it only while the committed document is usable. Each
operation's behavioral owner retains its semantics. A disposed open document
and its references do not revive when a document is reopened; consumers use the
host's current open document. Their kind and identity remain readable.

[SDK design](../../dev/sdk.md) owns contributor guidance and external design references.

## State and observation

An open document exposes the document root and resolves editor notes by
document-local note ID; cross-document identity for addressable editor notes
uses the global [`noteAddress`](./note-ids.md#definitions). The document root
is the same logical [document note](./user-data.md) exposed through account metadata.
Its Content and Access collection notes are reachable from it. The Content
collection and each editor note support [children reads](./note-model.md#collections), which return references
to their current direct editor children in order, and
[appending](./insertion.md#appending-notes). Creating a live reference
neither requires the note to exist nor creates it. Value reads resolve the
current committed note; an unavailable note or source produces an identifiable
unavailable-note error, distinct from unexpected read failures.

Document metadata and editor content are independently available. A usable
document reference returns its two child collection references even when either
collection's contents are unavailable. Synchronous reads use locally available
state; the host owns asynchronous acquisition.

A parent read returns a reference to the editor note's current parent, or the
Content collection for a top-level note. Both collections return the document as
their parent. The document's outer parent follows the [user-data hierarchy](./user-data.md#hierarchy).

Informative: A retained reference stays useful across edits and deletion/undo.
Its values are fresh when read; previously returned values do not update
themselves.

Capability reads report current semantic eligibility for the addressed note,
focus, selection, or history. An ineligible action, missing target, or unavailable
source returns false; unexpected read failures propagate. A capability result
neither establishes target existence or source readiness nor guarantees that a
later operation takes effect.

Observation is scoped to the document note, a collection, an addressed editor
note, including its parent identity and children, or action capabilities and
signals that the relevant state should be reread. Addressed references and current
action capabilities are readable without subscribing. Document-note observation
covers metadata and its collections, including their independent availability and
operation eligibility.
Each subscription is
independent, can be released repeatedly, and may remain active through
unavailability or a failed read to observe recovery. Notifications include
changes in target or source availability and read failures, even when capability
values remain false. Listeners may safely invoke open-document operations.

## Operations and ownership

Mutations target document metadata ([user data operations](./user-data.md#operations)),
the Content collection, an addressed editor note, the currently focused note,
the current selection, the current view, or document history. Mutations of the
Content collection or an addressed note are independent of the current view. An
asynchronous editor-content mutation resolves once reads reflect its change,
which does not imply collaboration or persistence. It rejects with an
ineligible-operation error, leaving the document unchanged, when its target is
unavailable or ineligible; for an unavailable note, that error is the
unavailable-note error. A synchronous mutation no-ops instead.

Changing the document name leaves editor content unchanged.

A host without a viewer exposes the same open document. Its focus, selection,
and history are empty and its view is the whole document, so their capability
reads return false and their synchronous operations no-op.

Adapters own framework and storage mechanics. Consumer surfaces own which
operations they offer and how they present and interact with them.
Editor bindings resolve row or selection context to stable note identity before
passing it to consumers.
