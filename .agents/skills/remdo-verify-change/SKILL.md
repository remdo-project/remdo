---
name: remdo-verify-change
description: Verify a default or explicitly selected RemDo uncommitted or Git-range scope with focused uncommitted checks, fresh Codex and Claude reviews, and evidence-based finding dispositions. Use when the user or another workflow asks to verify, inspect, or independently review a completed repository change without editing, approving, committing, or advancing its lifecycle.
---

# RemDo Verify Change

Verify one scope under the authoritative [`remdo-verify-change`](../../../docs/specs/agents/skills/remdo-verify-change.md) contract.

## Resolve the scope

Accept an omitted scope, `uncommitted`, an explicit `<left>..HEAD` /
`<left>...HEAD` Git range, or an unambiguous description that maps to one of
them. Translate a supplied description before running the resolver; ask only
when it is ambiguous.

Run the [shared scope resolver](../_shared/tools/resolve-scope.sh) from the repository root:

```sh
sh <shared-resolver-path> [scope]
```

Stop on a non-zero exit. Retain the emitted `STATE`, `SCOPE`, immutable `BASE`
and `HEAD_SHA`, and file list. Report `no-change` immediately when `STATE`
equals it; do not run checks or reviews. Otherwise checks and reviewers must
inspect the selected scope; the caller owns its stability.

## Run focused checks

For `uncommitted`, inspect the resolved files and run the focused tests and
applicable static checks required by the contributor
[`Testing`](../../../docs/dev/testing.md#verification-lifecycle) policy.

For `commit-range`, proceed to reviews without local checks.

If a focused command fails, report its command and outcome, then stop before
invoking reviewers.

## Run fresh reviews

Then attempt fresh Codex and Claude reviews concurrently through the runtime's
managed parallel-call surface. Never shell-background either process. Do not
substitute another reviewer when one is missing or fails, and do not abort the
other review.

Invoke the shared runner directly with high effort:

- Codex: `node .agents/skills/_shared/tools/read-only-runner.ts --effort high
  codex review uncommitted` or replace `uncommitted` with `commit-range <BASE>`.
- Claude: `node .agents/skills/_shared/tools/read-only-runner.ts --effort high
  claude review uncommitted` or replace `uncommitted` with `commit-range <BASE>`.

Run these commands exactly. The [`read-only runner`](../_shared/tools/read-only-runner.ts) owns the fresh
session, review scope mapping, [repository protection](../../../docs/specs/agents/tools/read-only-runner.md#repository-protection),
cancellation, protocol completion, and response extraction.

Reviewer runtime is unspecified. Wait for each managed call's completion
notification; do not poll it or interpret silence or elapsed time as failure.
Cancel a review only when the caller or enclosing lifecycle explicitly abandons
it.

Exit status `2` means the provider or its declared native review capability is
unavailable. Any other non-zero result is
failed; treat its output as failure evidence, not as findings. Exit status `0`
carries one versioned JSON review-evidence object. Read every ordered response;
none is guaranteed to be final, exhaustive, or authoritative. A failed response
always makes the review failed but does not discard its or any other response's
text. Otherwise, classify the review as completed only when the evidence
collectively represents inspection of the full selected scope without an
unresolved material inspection gap. Earlier lifecycle notifications can be
resolved by later evidence. Use the complete review evidence as failure
evidence for a failed review. Do not substitute a fixed phrase list for this
semantic judgment.

## Validate findings

After both review attempts finish, extract every concrete candidate finding
from every non-empty response text regardless of response status, including
candidates omitted, refuted, or withdrawn by another response. Deduplicate
equivalent candidates, then classify each one
under the
authoritative specification's [Findings](../../../docs/specs/agents/skills/remdo-verify-change.md#findings) contract.
Treat lifecycle-only responses as having no candidate. Treat corrections and
withdrawals as disposition evidence, not as automatic dispositions.

## Report

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/remdo-verify-change.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
