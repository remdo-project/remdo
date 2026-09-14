# Open document session

An open document session is the adapter-neutral contract between consumers and
one opened document. It exposes [editor notes](./note-model.md#note-kinds), [search](./search.md),
action capabilities, and semantic operations. The application host owns its
lifetime and exposes it only while the committed document is usable. Each
operation's behavioral owner retains its semantics.

## State and observation

The session resolves editor notes by document-local note ID; cross-document
identity for addressable editor notes uses the global
[`noteRef`](./note-ids.md#definitions). An addressed handle reads the current
committed note and fails when it does not exist, including after deletion,
rather than returning stale or substitute data.

Observation is scoped to an addressed note or action
capabilities and signals that the relevant state should be reread. Addressed
handles are readable without subscribing. Observable capability
states distinguish unavailable, failed, and ready values; every ready value is an
immutable, coherent revision. Listeners may safely invoke session operations.

## Operations and ownership

Mutations target an addressed note, the currently focused note, the current
selection, the [view](./folding.md#fold-to-level), or document history. They resolve and validate their
targets when executed and no-op when the source or target is unavailable.
An asynchronous mutation resolves after its resulting local update commits,
without waiting for listener delivery, collaboration, or persistence.

Adapters own framework and storage mechanics. Consumer surfaces own which
operations they offer and how they present and interact with them.
