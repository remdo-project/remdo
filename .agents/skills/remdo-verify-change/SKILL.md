---
name: remdo-verify-change
description: Verify a default or explicitly selected RemDo uncommitted or Git-range scope with focused uncommitted checks, fresh independent reviews from configured providers, and evidence-based finding dispositions. Use when the user or another workflow asks to verify, inspect, or independently review a completed repository change without editing, approving, committing, or advancing its lifecycle.
---

# RemDo Verify Change

Verify one scope under the authoritative [`remdo-verify-change`](../../../docs/specs/agents/skills/remdo-verify-change.md) contract.

Use the shared [review-context procedure](../_shared/references/review-context.md) for scope and contract reads.

## Resolve the scope

Accept an omitted scope, `uncommitted`, an explicit `<left>..HEAD` /
`<left>...HEAD` Git range, or an unambiguous description that maps to one of
them. Translate a supplied description before running the resolver; ask only
when it is ambiguous.

Run the [shared scope resolver](../_shared/tools/resolve-scope.sh) from the repository root:

```sh
sh <shared-resolver-path> [scope]
```

Use the emitted complete change-scope result. When its state is `no-change`,
report `no-change` immediately and do not run checks or reviews. Otherwise
checks and reviewers must inspect the selected scope; the caller owns its
stability.

## Run focused checks

For `uncommitted`, inspect the resolved files and run the focused tests and
applicable static checks required by the contributor [`Testing`](../../../docs/dev/testing.md#verification-lifecycle) policy.

For `commit-range`, proceed to reviews without local checks.

If a focused command fails, report its command and outcome, then stop before
invoking reviewers.

## Run fresh reviews

Resolve [agent settings](../../../docs/specs/agents/settings.md) from the
repository root:

```sh
node --import=tsx .agents/skills/_shared/tools/resolve-agent-settings.ts
```

Use the emitted document.

Then attempt a fresh review for each configured `remdo-verify-change`
reviewer using the [review runner](references/managed-collection.md). Launch the runner as one managed
foreground call; it owns concurrent reviewer processes and output collection.
Do not delegate process monitoring to an agent, substitute a failed reviewer,
or abort another review.

Use this briefing for every configured reviewer, followed by a compact factual
summary of available check commands, outcomes, and limitations. Identify skipped
checks rather than implying they passed; omit earlier review conclusions.

> Checks are handled by the coordinating workflow. Avoid rerunning routine tests,
> lint, builds, or other checks. Run a targeted check when it would materially
> resolve uncertainty or cover a gap; mention what you ran, why, and the results
> in the final report.
> Inspect the complete requested scope and return one consolidated findings
> report, stating whether inspection was complete and identifying any material
> gap. Review the implementation and test adequacy using repository evidence.
> Follow `.agents/skills/_shared/references/review-context.md` for evidence reads.
> Pass this briefing and the available check summary to every delegated reviewer.

Invoke each configured reviewer from the dispatch below using that reviewer's
resolved `model` and `effort` in a fresh session. Include all invocations in
the runner plan and request any required enclosing runtime escalation for
their provider transport and native session persistence when launching it:

- `codex`: run `codex exec -s read-only --ignore-rules` with `--disable hooks`,
  `approval_policy="never"`, `notify=[]`, `model="<model>"`,
  `model_reasoning_effort="<effort>"`, and the review briefing as
  `developer_instructions`; then pass `review --uncommitted` or
  `review --base <BASE>`.
- `claude`: generate and retain a fresh UUID as `SESSION_ID`, then run
  `/usr/bin/env CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude -p --model
  <model> --effort <effort> --permission-mode auto --session-id
  <SESSION_ID> --setting-sources user,project --settings
  '{"disableAllHooks":true}'`. Start its prompt with `/code-review
  <effort>`, followed by every resolved changed path as a quoted argument
  for `uncommitted`, or the exact `<BASE>..<HEAD>` range for a commit
  range, then append the review briefing.
- `grok`: generate and retain a fresh UUID as `SESSION_ID`, then run
  `grok --model <model> --effort <effort> --session-id <SESSION_ID>
  --permission-mode dontAsk --sandbox read-only --disable-web-search
  --no-auto-update --no-plan --verbatim -p <prompt>`. Grok's `-p` takes
  the prompt as its next argument, unlike Claude's boolean `-p`. The
  prompt is the review briefing, then every resolved changed path
  JSON-quoted for `uncommitted`, or the exact `<BASE>..<HEAD>` range for
  a commit range, then: do not invoke skills.

For an uncommitted Claude or Grok review, derive the changed paths again from
NUL-delimited staged, unstaged, and untracked Git output. Deduplicate the exact
path strings and append each with JSON string quoting; do not parse the
resolver's display-oriented `FILES` lines.

Pass executable arguments as literal strings in the runner plan; no shell
evaluates them. The runner retains combined output and exit status for each
invocation. Retain available session IDs for diagnostics or report recovery.

Reviewer runtime is unspecified. Wait for the runner's completion
notification; do not inspect live histories, request agent status, or interpret
silence or elapsed time as failure. When the runtime requires explicit wait
calls, use the longest wait allowed by its tool and enclosing instructions,
resuming the same call after a timeout. Do not interleave sleeps, log reads,
or extra status calls. A required human progress update does not require a
new reviewer inspection or a message through another agent.
Cancel a review only when the caller or enclosing lifecycle explicitly abandons
it.

After the runner finishes, classify each review under the authoritative specification's
[`Reviews`](../../../docs/specs/agents/skills/remdo-verify-change.md#reviews)
contract. For a successful command, retain a usable consolidated final report
from its saved output as review evidence. Consult native session histories only
to troubleshoot a concrete problem or recover a missing final report; progress
or diagnostics alone do not satisfy completion. For an unsuccessful invocation,
retain its exit status or launch or cleanup error and available combined output
as failure evidence. Judge complete scope inspection from the final report.
Classify a missing executable, including shell exit status `127` with
command-not-found evidence, as `unavailable`.

## Validate findings

After every configured review attempt finishes, apply the authoritative
specification's [`Findings`](../../../docs/specs/agents/skills/remdo-verify-change.md#findings)
contract to their complete evidence.

## Report

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/remdo-verify-change.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
