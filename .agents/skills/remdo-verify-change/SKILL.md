---
name: remdo-verify-change
description: Verify a default or explicitly selected RemDo uncommitted or Git-range scope with focused uncommitted checks, fresh independent reviews from configured providers, and evidence-based finding dispositions. Use when the user or another workflow asks to verify, inspect, or independently review a completed repository change without editing, approving, committing, or advancing its lifecycle.
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
reviewer concurrently through the runtime's managed parallel-call surface.
Never shell-background a review process. Do not substitute another reviewer
when one is missing or fails, and do not abort another review.

Use this review constraint for every configured reviewer:

> Repository verification is handled outside this review. Do not run or
> manually reproduce repository tests or checks, including through ad hoc
> commands. Inspect the complete requested scope; in the final response,
> reproduce the complete consolidated findings report,
> explicitly state whether inspection was complete and identify any material
> gap. Review the implementation and test adequacy using repository evidence.
> Pass these instructions to every delegated reviewer. Report any additional
> runtime check needed and why; do not run it.

Invoke each configured reviewer from the dispatch below using that reviewer's
resolved `model` and `effort` in a fresh session, requesting any required
enclosing runtime escalation for normal provider transport and native session
persistence when launching the managed call:

- `codex`: run `codex exec -s read-only --ignore-rules` with `--disable hooks`,
  `approval_policy="never"`, `notify=[]`, `model="<model>"`,
  `model_reasoning_effort="<effort>"`, and the review constraint as
  `developer_instructions`; then pass `review --uncommitted` or
  `review --base <BASE>`.
- `claude`: generate and retain a fresh UUID as `SESSION_ID`, then run
  `/usr/bin/env CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude -p --model
  <model> --effort <effort> --permission-mode auto --session-id
  <SESSION_ID> --setting-sources user,project --settings
  '{"disableAllHooks":true}'`. Start its prompt with `/code-review
  <effort>`, followed by every resolved changed path as a quoted argument
  for `uncommitted`, or the exact `<BASE>..<HEAD>` range for a commit
  range, then append the review constraint.
- `grok`: generate and retain a fresh UUID as `SESSION_ID`, then run
  `grok --model <model> --effort <effort> --session-id <SESSION_ID>
  --permission-mode dontAsk --sandbox read-only --disable-web-search
  --no-auto-update --no-plan --verbatim -p <prompt>`. Grok's `-p` takes
  the prompt as its next argument, unlike Claude's boolean `-p`. The
  prompt is the review constraint, then every resolved changed path
  JSON-quoted for `uncommitted`, or the exact `<BASE>..<HEAD>` range for
  a commit range, then: do not invoke skills.

For an uncommitted Claude or Grok review, derive the changed paths again from
NUL-delimited staged, unstaged, and untracked Git output. Deduplicate the exact
path strings and append each with JSON string quoting; do not parse the
resolver's display-oriented `FILES` lines.

Construct the Claude and Grok prompts without evaluating path text as
shell syntax. Capture each command's combined ordinary output and exit
status through the runtime's managed call rather than a repository
wrapper or response file. Retain each reviewer's session ID with its
result. After each review finishes, use that ID to inspect its persisted
native session and every delegated-review history to perform the
specification's empirical command validation. For Grok, read
`$GROK_HOME/sessions/<urlencoded-cwd>/<SESSION_ID>/chat_history.jsonl`
(default `GROK_HOME` is `~/.grok`). Nested `subagents/*/meta.json` is
only an index: follow each `child_session_id` to that sibling session's
`chat_history.jsonl`. Tool-call arguments in those files are command
evidence. A final report's description of its own activity is not
command evidence.

Reviewer runtime is unspecified. Wait for each managed call's completion
notification; do not poll it or interpret silence or elapsed time as failure.
Cancel a review only when the caller or enclosing lifecycle explicitly abandons
it.

Classify each native result under the authoritative specification's
[`Reviews`](../../../docs/specs/agents/skills/remdo-verify-change.md#reviews)
contract. For a successful command, retain a usable consolidated final report
from the combined output or its identified persisted native session as review
evidence, together with any available combined-output diagnostics; progress or
diagnostics alone do not satisfy completion. For an unsuccessful command,
retain its exit status and non-empty combined output as failure evidence. Judge
complete scope inspection from the final report rather than provider progress
events. Classify a missing executable, including shell exit status `127` with
command-not-found evidence, as `unavailable`.

## Validate findings

After every configured review attempt finishes, apply the authoritative
specification's [`Findings`](../../../docs/specs/agents/skills/remdo-verify-change.md#findings)
contract to their complete evidence.

## Report

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/remdo-verify-change.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
