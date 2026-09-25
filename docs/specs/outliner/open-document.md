# Open document

An open document is the adapter-neutral contract between consumers and
one opened document. It exposes the [document root](./note-model.md#definitions), [editor notes](./note-model.md#note-kinds), [search](./search.md),
action capabilities, and semantic operations. The application host owns its
lifetime and exposes it only while the committed document is usable. Each
operation's behavioral owner retains its semantics. A disposed open document
and its references do not revive when a document is reopened; consumers use the
host's current open document.

[SDK design](../../dev/sdk.md) owns contributor guidance and external design references.

## State and observation

An open document exposes the document root and resolves editor notes by
document-local note ID; cross-document identity for addressable editor notes
uses the global [`noteAddress`](./note-ids.md#definitions). The document root
and each editor note support children reads, which return references to the
note's current direct children in order, and
[appending](./insertion.md#appending-notes). Creating a live reference
neither requires the note to exist nor creates it. Value reads resolve the
current committed note; an unavailable note or source produces an identifiable
unavailable-note error, distinct from unexpected read failures.

Informative: A retained reference stays useful across edits and deletion/undo.
Its values are fresh when read; previously returned values do not update
themselves.

Capability reads report current semantic eligibility for the addressed note,
focus, selection, or history. An ineligible action, missing target, or unavailable
source returns false; unexpected read failures propagate. A capability result
neither establishes target existence or source readiness nor guarantees that a
later operation takes effect.

Observation is scoped to an addressed editor note, including its children, or
action capabilities and signals that the relevant state should be reread. Addressed
references and current action capabilities are readable without subscribing.
Each subscription is
independent, can be released repeatedly, and may remain active through
unavailability or a failed read to observe recovery. Notifications include
changes in target or source availability and read failures, even when capability
values remain false. Listeners may safely invoke open-document operations.

## Operations and ownership

Mutations target the document root, an addressed editor note, the currently
focused note, the current selection, the current view, or document history.
Mutations of the document root or an addressed note are independent of the
current view. An asynchronous
mutation resolves once reads reflect its change, which does not imply
collaboration or persistence. It rejects with an ineligible-operation error,
leaving the document unchanged, when its target is unavailable or ineligible. A
synchronous mutation no-ops instead.

A host without a viewer exposes the same open document. Its focus, selection,
and history are empty and its view is the whole document, so their capability
reads return false and their synchronous operations no-op.

Adapters own framework and storage mechanics. Consumer surfaces own which
operations they offer and how they present and interact with them.
Editor bindings resolve row or selection context to stable note identity before
passing it to consumers.
