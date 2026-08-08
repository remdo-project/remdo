# Workflow Action Presentation

This user-raised draft case records feedback on the branch setup while drafting
the [`remdo-deps-refresh`](../../agents/skills/remdo-deps-refresh.md) contract.

## Pre-change

```markdown
## Branch

A new run fetches `origin/main`, fixes the fetched commit as its base, and
creates a new topic branch without an upstream. It requires a clean repository
and never applies refresh work on `main`, `dev`, or the branch from which it was
invoked. An interrupted run resumes its recorded refresh branch.
```

## Change request

**Challenge:** The branch setup:

- emphasizes excluded behavior;
- presents actions outside their execution order; and
- expresses its trivial sequence as prose instead of a list.

**Agreed actions:** Rewrite only the branch setup with positive wording and its
trivial sequence in causal list order. Keep the surrounding skill behavior
outside this case.

## Post-change

```markdown
## Branch

A run uses one refresh branch. An interrupted run resumes its recorded branch.
A new run:

1. Requires a clean repository.
2. Fetches `origin/main` and fixes the fetched commit as its base.
3. Creates and enters a topic branch without an upstream.
```
