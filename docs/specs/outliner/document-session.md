# Open document session

An open document session is the adapter-neutral contract between consumers and
one opened document. It exposes [editor notes](./note-model.md#note-kinds),
action capabilities, and semantic operations. The application host owns its
lifetime, and each operation's behavioral owner retains its semantics.

## State and observation

The session resolves editor notes by document-local note ID; cross-document
identity for addressable editor notes uses the global
[`noteRef`](./note-ids.md#definitions). An addressed handle reads the current
committed note and fails when it does not exist, including after deletion,
rather than returning stale or substitute data.

Observation is scoped to an addressed note, the whole document, or action
capabilities and signals that the relevant state should be reread. Addressed
handles are readable without subscribing. Observable document and capability
states distinguish unavailable, failed, and ready values; every ready value is an
immutable, coherent revision. Listeners may safely invoke session operations.

## Operations and ownership

Operations target an addressed note, the currently focused note, the current
selection, or document history. They resolve and validate their targets when
executed and no-op when the source or target is unavailable. An asynchronous
operation resolves after its resulting local update commits, without waiting
for listener delivery, collaboration, or persistence.

Adapters own framework and storage mechanics. Consumer surfaces own which
operations they offer and how they present and interact with them.
