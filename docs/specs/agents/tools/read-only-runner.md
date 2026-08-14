# Read-only runner

The read-only runner maps one native review invocation to a fresh Codex or
Claude CLI session rooted at the caller's current Git repository. It owns CLI
invocation, repository behavior, protocol completion, and response extraction;
callers own the meaning of the response.

## Call

```text
read-only-runner [options] <agent> review <scope>
```

- `<agent>`: `codex` or `claude`.
- `<scope>`: a resolved [change scope](../change-scope.md), encoded as:
  - `uncommitted`
  - `commit-range <base>`
- `--model <model>`: optional model value.
- `--effort <effort>`: optional effort value.

The runner forwards supplied model and effort values to the agent unchanged and
leaves absent values unset, so the agent applies its own default.

A review caller owns repository verification separately and keeps the resolved
scope unchanged until the review completes. The runner does not run or validate
repository checks.

## Review

Each agent's native review inspects the complete resolved scope,
repository guidance, Git context, and referenced files, and reviews the scope
the runner resolved rather than one the agent selects itself. **Empirical.** A
review whose inspection access is incomplete can still report findings and
success, so confirmation observes review reach rather than its result.

A review uses the native command's instructions and the repository guidance its
session loads. The runner tells the reviewing agent that repository checks are
handled separately, to neither run nor manually reproduce them, and to pass the
instructions to every reviewer it delegates to. The reviewer reports any needed
runtime check and why without running it. This is cooperative guidance, not a
tool restriction. **Empirical.** During validation, no reviewer process runs or
manually reproduces a repository check; forwarded instructions do not establish
compliance, so confirmation observes the commands they run.

## Repository protection

The runner itself writes no repository state and requests non-persistent review.
Codex requests its native read-only sandbox. Claude retains unrestricted shell
access so its native review can inspect complete Git history and repository
state. The runner does not establish a boundary against effects from every
provider integration or unrestricted shell command.

## Lifecycle

The review observes repository state present when it begins. Its caller keeps
that state unchanged until completion to preserve the resolved scope.

Each invocation makes one attempt in a non-persistent session; retry belongs to
the caller. The runner waits without a ceiling for background subagents and
workflows the review delegates to. The runner has no execution deadline, and
neither silence nor elapsed time indicates failure. It runs until the agent
completes or the caller cancels it. Cancellation ends the agent invocation and
returns a failed result without a response.

## Result

A result is encoded by the runner's exit status and output:

- `responded`: exit `0` and write only the review evidence to stdout;
- `unavailable`: exit `2` and write evidence that the agent CLI is unavailable
  to stderr;
- `failed`: any other non-zero exit and failure evidence on stderr.

`unavailable` and `failed` are [concerns](../protocol.md#concerns).

Only `responded` writes stdout. It confirms only that the runner produced a valid
review-evidence object, not provider transport completion, native-review
execution, or coverage of the selected scope; the caller judges the evidence.
When a provider process exits unsuccessfully,
its failure evidence includes any non-empty provider stderr verbatim after the
runner-owned summary; provider stdout is not failure evidence.

Review stdout is one JSON object with this shape:

```json
{
  "complete": false,
  "responses": [
    "First response",
    "Partial response",
    "Later response"
  ],
  "diagnostic": "provider reported incomplete review execution"
}
```

`responses` contains every non-empty review response the provider exposes, in
provider order. The runner does not concatenate, summarize, deduplicate, or
select among them, and does not expose other provider event traffic. A response
can be a summary, finding, addendum, correction, withdrawal, or lifecycle
notification; none is guaranteed to be final, complete, exhaustive, or
authoritative. Those are semantic judgements for the review caller.

`complete` is `true` when every provider result the runner observed was
well-formed and successful. Empty successful results carry no evidence and are
omitted. It does not establish that the responses semantically cover the full
review scope. When `complete` is `false`, `diagnostic` gives a coarse reason and
any response text remains usable as candidate-finding evidence. When no response
text is usable, the runner instead returns a failed result with the complete raw
output as failure evidence.

When a provider exits successfully but its output does not yield valid review
evidence, the failure evidence includes that output verbatim after the
runner-owned summary, so the caller can diagnose an unrecognized protocol shape
from the failure alone.

## Future

- Enforce Claude invocations without adding host requirements to trusted review
  sessions.
- Confirm the provider protocols the runner depends on against the installed
  CLIs rather than against runner-authored stubs alone, so a provider change
  fails a check instead of silently changing what callers receive. Weigh this
  against a check that needs provider credentials and network access.
- Establish that a Claude native review command is absent, so the runner reports
  it as unavailable instead of leaving the caller to judge the report. The
  session inventory is the only documented signal and requires a separate
  session per review; weigh that cost against the caller's own judgement.

## References

- [Claude Code: background tasks at exit](https://code.claude.com/docs/en/headless#background-tasks-at-exit)
  — print-mode waiting behavior for background subagents and workflows.
