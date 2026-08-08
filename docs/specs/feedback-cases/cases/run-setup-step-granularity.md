# Run Setup Step Granularity

This user-raised draft case records feedback on the run sequence while drafting
the [`remdo-deps-refresh`](../../agents/skills/remdo-deps-refresh.md) contract.

## Pre-change

```markdown
## Run

1. Confirm the repository is clean, fetch `origin/main`, and create the refresh
   branch from the fetched commit.
2. Apply one available update class.
3. Reconcile its fallout, verify the resulting state, and commit it.
4. Repeat steps 2–3 until no update remains.
5. Reconcile dependency follow-up, verifying and committing any resulting
   change.
6. Report `refreshed`, `current`, or `stopped`.

The run stops when it cannot determine a safe correction.
```

## Change request

**Challenge:** The first list item combines three independently meaningful,
ordered setup actions, so the numbering does not expose their separate
responsibilities or causal order.

**Agreed actions:** Split only the setup item into separate clean-state, target,
and branch-creation steps, then update the later numbering and loop reference.

## Post-change

```markdown
## Run

1. Confirm the repository is clean.
2. Fetch `origin/main` and fix the fetched commit as the run's base.
3. Create the refresh branch from that base.
4. Apply one available update class.
5. Reconcile its fallout, verify the resulting state, and commit it.
6. Repeat steps 4–5 until no update remains.
7. Reconcile dependency follow-up, verifying and committing any resulting
   change.
8. Report `refreshed`, `current`, or `stopped`.

The run stops when it cannot determine a safe correction.
```
