# User data notes

User data notes expose the signed-in account's
[document list](../../architecture.md#document-registry) to consumers: its
documents and each document's direct grants, under
[Document Access](../access/access-control.md#document-access). The
[open document](./open-document.md) owns the notes inside an opened
document.

## State and observation

A document note is a live reference to one listed document by its
[`docId`](../../architecture.md#document-identity); each value read resolves the
current document list. Value reads of a document that is no longer listed
produce the same identifiable unavailable-note error as an
[open document](./open-document.md#state-and-observation); its
capability reads return false.

Observing a document note signals that its values, eligibility, or availability
should be reread. Each subscription is independent, can be released repeatedly,
and remains active while the document is unlisted.

## Operations

Creating, [renaming](./location-header.md#document-rename),
[sharing](../access/access-control.md#document-sharing), and
[deleting](../access/access-control.md#document-deletion) a document resolve
once the document's source acknowledges the operation and the document list
includes the acknowledged result. A later document-list refresh failure does not
fail a resolved operation. A rejected operation leaves the document list
unchanged. An operation addresses its document by `docId` whether or not the
document is listed; the document's source decides its outcome.
