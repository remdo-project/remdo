# Sharing

## Purpose

Define the lifecycle of a reusable share link for one document.

## Terms

- **Share link:** a URL that opens one specific document.
- **Shared document:** a document that currently has an active share link.
- **Revoked share link:** a previously issued share link that no longer opens
  the document.

## Lifecycle

1. Every document starts unshared.
2. A user can enable sharing for the current document.
3. Enabling sharing creates a share link for that document.
4. While share-link creation is still in progress, the UI shows that the
   document is generating a share link.
5. Once generation completes, the document is shared and the share link is
   visible and reusable.
6. A user can disable sharing for the current document.
7. Disabling sharing revokes the current share link immediately.
8. A revoked share link must no longer open the document.
9. Re-enabling sharing after revocation creates a new share link.
10. The newly created share link must differ from the previously revoked one.
11. At most one share link is active for a document at a time.
