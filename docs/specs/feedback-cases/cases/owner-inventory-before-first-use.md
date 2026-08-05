# Owner Inventory Before First Use

This user-raised case records an ownership-linking issue found while reviewing
the [Access Control](../../access/access-control.md) specification. The agreed
post-change form is captured before applying it to the source so a blind
workflow experiment can evaluate the pre-change document.

## Pre-change

Opening:

```markdown
# Access Control

Access control combines authenticated identity, administrative authority, and
document ownership or grants. These boundaries determine which app state and
collaboration credentials a user can receive.

Shared token, routing, registry, and document-identity terms are defined in
[Architecture Terms](../../architecture.md).
```

First use of the document registry:

```markdown
The SQL-backed user role and document registry are the authorization sources of
truth. Session UI and read-only Yjs
[user-data projections](../../architecture.md#document-registry) may expose
their results but do not authorize a request.
```

First use of document client tokens:

```markdown
The server issues
[Y-Sweet document client tokens](../../architecture.md#token-vocabulary)
according to the resulting access:
```

## Change request

**Challenge:** The opening inventories several terms owned elsewhere instead of
introducing them where the access-control clauses use them. Routing and document
identity never appear in the local contract, while the document registry lacks
a link at its first use. The inventory therefore adds no access-control
information and makes the document's actual dependencies harder to follow.

**Agreed actions:** Remove the opening inventory. Introduce only external terms
used by the local contract, and link each one inline at its first use to the
precise owner.

## Post-change

Opening:

```markdown
# Access Control

Access control combines authenticated identity, administrative authority, and
document ownership or grants. These boundaries determine which app state and
collaboration credentials a user can receive.
```

First use of the document registry:

```markdown
The SQL-backed user role and
[document registry](../../architecture.md#document-registry) are the
authorization sources of truth. Session UI and read-only Yjs
[user-data projections](../../architecture.md#document-registry) may expose
their results but do not authorize a request.
```

First use of document client tokens:

```markdown
The server issues
[Y-Sweet document client tokens](../../architecture.md#token-vocabulary)
according to the resulting access:
```
