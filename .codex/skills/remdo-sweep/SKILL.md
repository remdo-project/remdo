---
name: remdo-sweep
description: Use only when explicitly requested with phrases such as "run diff sweep", "run branch sweep", "run repo sweep", "run RemDo sweep", "cleanup the uncommitted changes", "check related leftovers", or "do a docs/code consistency cleanup pass". Run a small, conservative cleanup pass over a selected RemDo scope (uncommitted diff, current branch, or whole repo), checking it against RemDo guidance, directly relevant docs, nearby code, tests, and implementation patterns without broadening the task.
---

# RemDo Sweep

## Overview

Run an explicit cleanup pass over a selected scope of RemDo changes. Keep the
pass narrow: apply only low-risk cleanup clearly within the selected scope,
and report larger or ambiguous concerns as deferred follow-ups.

Never stage or commit changes.

## Select The Scope

Take the scope from the request; default to `diff` when none is given.

- `diff`: uncommitted changes, `BASE=HEAD`.
- `branch`: everything the current branch introduces plus uncommitted
  changes; `BASE` is the commit the branch forked from. If the request names
  a parent branch, use `BASE=$(git merge-base <parent> HEAD)`. Otherwise
  detect the fork commit:

  ```sh
  CUR=$(git branch --show-current); HEADC=$(git rev-parse HEAD); BASE=""
  for ref in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vx "$CUR"); do
    mb=$(git merge-base HEAD "$ref") || continue
    [ "$mb" = "$HEADC" ] && continue
    if [ -z "$BASE" ] || git merge-base --is-ancestor "$BASE" "$mb"; then BASE=$mb; fi
  done
  : "${BASE:=$(git merge-base main HEAD)}"
  ```

  This picks the deepest fork point across local branches, so a branch cut
  from another feature branch sweeps only its own commits.
- `repo`: the whole repository; no `BASE`.

## Inspect The Surface

For `diff` and `branch` scopes, start with the cheap overview commands:

```sh
git status --short --branch
git diff --stat $BASE
git diff --name-status $BASE
git diff --check $BASE
git ls-files --others --exclude-standard
```

Use these outputs to identify the changed feature area and the exact cleanup
surface.

Then read the diff contents, sized by the `--stat` totals: for a small diff
(roughly a few hundred changed lines or less), run `git diff $BASE` once; for
anything larger, read it per file with `git diff $BASE -- <path>`,
prioritizing the files most relevant to the changed feature area. For very
large surfaces (thousands of changed lines), do not read every file: rely on
deterministic checks and cross-cutting greps, deep-read only a representative
subset of the most relevant files, and state in the report what was skipped
and why.

Read any untracked files listed by `git ls-files --others --exclude-standard`
and judge whether they belong to the change; flag them only if they look
accidental.

For `repo` scope, do not attempt a manual line-by-line review. Use
deterministic checks (`pnpm run lint`, `pnpm run audit:cleanup`, relevant
tests) plus a docs-vs-code consistency pass over `docs/` (filenames and scope
openers as discovery), and manually inspect only the areas they flag.

## Read Guidance

Read:

- `AGENTS.md`
- `docs/contributing.md`

Then pick directly relevant docs by filename and scope opener. Do not reread
unrelated docs.

Apply these doc checks:

- If behavior changed, check whether docs should change too.
- Do not implement anything based only on `[Future]` docs.

## Review Related Sources

Inspect only code, tests, fixtures, and docs directly related to the swept
surface.

Use deterministic repo checks where they cover the concern, especially
`pnpm run lint`, `pnpm run audit:cleanup`, and relevant tests. If a check
fails or is misconfigured, treat that as a sweep finding rather than a
blocker; when a composite check aborts partway, run its remaining stages
individually so they still contribute findings. Then manually
inspect only the swept area for semantic leftovers those tools cannot prove,
such as stale comments, obsolete branches, accidental files, temporary
instrumentation, stale docs references, and mismatched naming.

## Cleanup Rules

Apply cleanup only when it is:

- Clearly within the selected scope
- Local to the inspected area
- Low-risk
- Behavior-preserving, unless the inspected change already intentionally
  changed behavior
- Consistent with RemDo docs and repo guidance

Do not edit when cleanup would require:

- Choosing between tradeoffs
- Changing product behavior beyond the selected scope
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

1. **Scope and surface reviewed**
   - State the selected scope (and branch base when relevant).
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
   - Group the initial inspection commands as one inspection check.
   - List final verification commands separately with pass/fail results.
