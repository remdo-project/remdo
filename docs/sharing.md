# Sharing

## Purpose

Define user-visible behavior for sharing a document through a reusable URL.

## Terms

- **Share link:** a URL that opens one specific document.
- **Shared document:** a document that currently has an active share link.
- **Revoked share link:** a previously issued share link that no longer opens
  the document.
- **Recipient:** the person opening a share link.

## Scope and boundaries

1. This spec covers sharing one document through a URL that can be reused to
   open that document later.
2. This spec defines user-visible sharing behavior only. Routing shape, token
   storage, control placement, and other implementation details are tracked in
   [docs/todo.md](./todo.md).
3. Current sharing scope is one server opening its own documents. Multi-server
   document lists remain future work.
4. A share link is for document access, not account provisioning or identity
   transfer.

## Behavior

1. Every document starts unshared.
2. A user can enable sharing for the current document.
3. Enabling sharing creates a share link for that document.
4. While share-link creation is still in progress, the UI shows that the
   document is generating a share link.
5. Once generation completes, the document is shared and the share link is
   visible and reusable.
6. Opening a valid share link loads the shared document.
7. A recipient can open a valid share link without logging in.
8. A recipient may be a different user from the one who created the share
   link.
9. A user can disable sharing for the current document.
10. Disabling sharing revokes the current share link immediately.
11. A revoked share link must no longer open the document.
12. Re-enabling sharing after revocation creates a new share link.
13. The newly created share link must differ from the previously revoked one.
14. At most one share link is active for a document at a time.

## Future

1. [Future] A share link may later be accepted by another server so that the
   referenced document can be added to that server's document list.
