# remdo-improve-document

This capability improves one caller-selected existing document into the
smallest sufficient contract that preserves its accepted behavior. It may
change other maintained documents only when required to keep ownership and
inbound links coherent. It does not change product behavior or modify
[specification feedback cases](../../feedback-cases/README.md).

## Improvement basis

The capability assesses the complete selected document against
[Documentation](../../../documentation.md), its linked owners, relevant
implementation and tests, and its Git history. Repository evidence clarifies
the contract and its provenance but does not silently replace unresolved
product decisions.

Before reshaping the document, the capability identifies its essential target
properties and accounts for its information as material to retain, relocate, or
drop. Material is retained only when its absence could permit a materially
incorrect interpretation; valuable material owned elsewhere moves to that
owner; redundant, mechanism-specific, or unsupported material is dropped.

## Transformation

The work forms coherent, review-sized semantic changes. It normally:

1. removes information without durable contract value;
2. moves valuable information to its narrowest owner, updating inbound links;
3. rewrites the remaining document around its target properties.

The phases may be combined when separation would add no review value. Historical
section structure does not constrain the result.

After reshaping, the capability compares the resulting owners with the selected
document's pre-improvement version information by information. Every original
piece is preserved, moved, deliberately dropped, or restored as a meaningful
loss. The comparison baseline is derived from the repository's current state
and Git history rather than recorded as durable commit identifiers.

## Coherence

Every review handoff and commit boundary is a coherent repository state. An
ownership move includes the complete contract and all required inbound-link
updates. When a required coherence repair cannot be included, the capability
stops instead of retaining or committing a partial result.

Transient working edits may be incomplete, but the capability does not hand
back conflicting owners, orphaned behavior, or broken links. Commit authority
follows the caller's authorized scope; without authority, the coherent result
remains uncommitted.

## Result

The result identifies the selected document, its target properties, material
dropped, moved, rewritten, or restored, the verification performed, and any
unresolved decision that prevented completion. Before reporting completion, the
capability checks each applicable Documentation rule separately and runs the
repository's required documentation and change checks.
