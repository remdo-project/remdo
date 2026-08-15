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
applicable static checks required by the contributor [`Testing`](../../../docs/dev/testing.md#verification-lifecycle) policy.

For `commit-range`, proceed to reviews without local checks.

If a focused command fails, report its command and outcome, then stop before
invoking reviewers.

## Run fresh reviews

Then attempt fresh Codex and Claude reviews concurrently through the runtime's
managed parallel-call surface. Never shell-background either process. Do not
substitute another reviewer when one is missing or fails, and do not abort the
other review.

Use this review constraint for both providers:

> Repository tests and checks are handled outside this review. Do not run or
> manually reproduce repository tests or checks, including through ad hoc
> commands. Inspect the complete requested scope; in the final response,
> explicitly state whether inspection was complete and identify any material
> gap. Review the implementation and test adequacy using repository evidence.
> Pass these instructions to every delegated reviewer. Report any additional
> runtime check needed and why; do not run it.

Invoke each native reviewer directly with high effort and a fresh,
non-persistent session:

- Codex: run `codex exec -s read-only --ephemeral` with
  `approval_policy="never"`, `model_reasoning_effort="high"`, and the review
  constraint as `developer_instructions`; then pass `review --uncommitted` or
  `review --base <BASE>`.
- Claude: run `claude -p --effort high --permission-mode dontAsk
  --setting-sources user,project --no-session-persistence`. Start its prompt
  with `/code-review`, followed by every resolved changed path as a quoted
  argument for `uncommitted`, or the exact `<BASE>..<HEAD_SHA>` range for a
  commit range, then append the review constraint.

Construct the Claude prompt without evaluating path text as shell syntax.
Capture each command's ordinary final stdout, stderr, and exit status through
the runtime's managed call rather than a repository wrapper or response file.

Reviewer runtime is unspecified. Wait for each managed call's completion
notification; do not poll it or interpret silence or elapsed time as failure.
Cancel a review only when the caller or enclosing lifecycle explicitly abandons
it.

Classify each native result under the authoritative specification's
[`Reviews`](../../../docs/specs/agents/skills/remdo-verify-change.md#reviews)
contract. Retain successful final stdout as review evidence; for an
unsuccessful command, retain its exit status and non-empty stderr as failure
evidence. Judge complete scope inspection from the final report rather than
provider progress events.

## Validate findings

After both review attempts finish, apply the authoritative specification's
[`Findings`](../../../docs/specs/agents/skills/remdo-verify-change.md#findings)
contract to their complete evidence.

## Report

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/remdo-verify-change.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
