---
name: remdo-diff-sweep
description: Use only when explicitly requested with phrases such as "run diff sweep", "run RemDo diff sweep", "cleanup the uncommitted changes", "check related leftovers", or "do a docs/code consistency cleanup pass". Run a small, conservative cleanup pass over uncommitted RemDo changes, checking the current diff against RemDo guidance, directly relevant docs, nearby code, tests, and implementation patterns without broadening the task.
---

# RemDo Diff Sweep

## Overview

Run an explicit post-implementation cleanup pass over the current uncommitted
RemDo diff. Keep the pass narrow: apply only low-risk cleanup clearly caused by
the existing diff, and report larger or ambiguous concerns as deferred
follow-ups.

Never stage or commit changes.

## Inspect The Diff

Start with the cheap overview commands:

```sh
git status --short
git diff --stat HEAD
git diff --name-status HEAD
git diff --check HEAD
git ls-files --others --exclude-standard
```

Use these outputs to identify the changed feature area and the exact cleanup
surface.

Then read the diff contents, sized by the `--stat` totals: for a small diff
(roughly a few hundred changed lines or less), run `git diff HEAD` once; for
anything larger, read it per file with `git diff HEAD -- <path>`, prioritizing
the files most relevant to the changed feature area.

Read any untracked files listed by `git ls-files --others --exclude-standard`
and judge whether they belong to the change; flag them only if they look
accidental.

## Read Guidance

Read:

- `AGENTS.md`
- `docs/index.md`
- `docs/contributing.md`

Then use `docs/index.md` as the navigation source for any directly relevant
docs. Do not reread unrelated docs.

Apply these doc checks:

- If behavior changed, check whether docs should change too.
- If docs changed, check whether `docs/index.md` needs a map or summary update.
- Do not implement anything based only on `[Future]` docs.

## Review Related Sources

Inspect only directly related code, tests, fixtures, and docs around the changed
area.

Use deterministic repo checks where they cover the concern, especially
`pnpm run lint`, `pnpm run audit:cleanup`, and relevant tests. Then manually
inspect only the changed area for semantic leftovers those tools cannot prove,
such as stale comments, obsolete branches, accidental files, temporary
instrumentation, stale docs references, and mismatched naming.

## Cleanup Rules

Apply cleanup only when it is:

- Clearly caused by the current diff
- Local to the changed area
- Low-risk
- Behavior-preserving, unless the original change already intentionally changed
  behavior
- Consistent with RemDo docs and repo guidance

Do not edit when cleanup would require:

- Choosing between tradeoffs
- Changing product behavior beyond the current diff
- A broad refactor
- A compatibility or migration decision
- New architecture
- Speculative simplification
- UI conclusions without browser verification
- Collaboration semantics not covered by existing docs or tests

Report those as deferred follow-ups instead.

## Verification

Use scoped checks while iterating when useful. Before finishing, run the checks
required for the current agent mode and report each final command with its
result.

## Final Response

Return a concise summary with these sections:

1. **Changed surface reviewed**
   - List the main files and areas inspected.
2. **Docs consulted**
   - List the relevant docs read.
   - State whether docs needed updates.
3. **Cleanup applied**
   - List concrete cleanup changes made.
   - If no cleanup was applied, say so.
4. **Deferred follow-ups**
   - List only related issues that were noticed but intentionally not changed.
   - Omit this section if there are none.
5. **Checks**
   - Group the initial Git inspection commands as one diff inspection check.
   - List final verification commands separately with pass/fail results.
