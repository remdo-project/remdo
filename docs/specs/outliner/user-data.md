# User data notes

User data notes expose the signed-in account's
[document list](../../architecture.md#document-registry) to consumers: its
documents and each document's direct grants, under
[Document Access](../access/access-control.md#document-access). The
[open document](./open-document.md) supplies editor content for the same
[document note](./note-model.md#definitions).

## State and observation

A document note is a live reference to one document by its
[`docId`](../../architecture.md#document-identity). An addressed reference can be
created independently of document-list membership; a list lookup returns only
listed documents. Each metadata read resolves the current document list.
Metadata reads of a document that is no longer listed
produce the same identifiable unavailable-note error as an
[open document](./open-document.md#state-and-observation); its metadata
capability reads return false. The document's `access` collection owns its direct
grant notes; each grant returns that collection as its parent. Its `content`
collection remains available as a reference without opened editor content, but
its editor children are unavailable and cannot be appended. Metadata reads do
not load editor content.

A grant's identity is scoped to its document and distinct from the grantee's
user ID. Grant reads reflect current metadata; a removed grant is unavailable.

User-data references live with the account's metadata host. An opened document's
reference has its own [host lifetime](./open-document.md), even though both
references identify the same document.

Observing a document note signals that its values, eligibility, or availability
should be reread. Each subscription is independent, can be released repeatedly,
and remains active while the document is unlisted.

While connected to its server, the document list reflects changes made
elsewhere to the account's document list without user action. After
reconnecting, it also reflects changes made while disconnected.

## Operations

Creating, [renaming](./location-header.md#document-rename),
[sharing](../access/access-control.md#document-sharing), and
[deleting](../access/access-control.md#document-deletion) a document resolve
once the document's source acknowledges the operation and the document list
includes the acknowledged result. A later document-list refresh failure does not
fail a resolved operation. A rejected operation leaves the document list
unchanged. An operation addresses its document by `docId` whether or not the
document is listed; the document's source decides its outcome. A document name
is at most 500 characters.
