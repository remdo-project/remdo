# Read-only runner

The read-only runner maps one prompt or native review invocation to a fresh
Codex or Claude CLI session rooted at the caller's current Git repository. It
owns CLI invocation, repository protection, protocol completion, and response
extraction; callers own the meaning of the response.

## Call

```text
read-only-runner [options] <agent> <invocation>
```

- `<agent>`: `codex` or `claude`.
- `<invocation>`:
  - `prompt <prompt>`
  - `review <scope>`
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

## Invocations

**Prompt.** The runner passes the prompt to the agent's non-interactive session
unchanged.

**Review.** Each agent's native review inspects the complete resolved scope,
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

Claude review requests completed stream events with verbose output because its
CLI requires verbose mode for stream JSON. It does not request partial message
chunks; only completed result events carry review-response evidence.

## Repository protection

Repository protection has one target outcome: an invocation leaves the caller's
Git repository unchanged and does not publish, schedule, or establish persistent
monitoring, notification, or remote control outside it. **Empirical.** Provider
documentation defines each restriction in isolation, not whether the combination
holds for a session that can reach mutation through an unrestricted path, so
confirmation observes repository and external state. Each invocation provides a
protection level, fixed by its agent, that states the caller condition for that
outcome.

An invocation retains the inspection access its task requires, including
complete Git history and repository state.

The caller chooses an agent whose level suits the prompt it supplies.

### Enforced

Codex invocations are enforced: the invocation cannot change the repository,
whatever the prompt asks, and the session cannot lift the restriction.

### Trusted prompt

Claude invocations are trusted-prompt: the runner provides the target outcome
when the prompt does not seek mutation or outside action. Shell access remains
available so the invocation can inspect Git completely, and a shell reaches any
effect a restriction on other tools would prevent, so this level offers no
protection from a prompt that seeks those effects.

The caller supplies a prompt it trusts not to seek those effects and owns that
judgement. A vendor-owned command documented to inspect and report meets this;
an untrusted prompt does not.

## Lifecycle

The invocation observes repository state present when it begins. A review
caller keeps that state unchanged until completion to preserve the resolved
scope; another caller does so when it requires consistency for the whole invocation.

Each invocation makes one attempt in a non-persistent session; retry belongs to
the caller. The runner waits without a ceiling for background subagents and
workflows the review delegates to. A provider can expose more than one response
as that work completes; the runner retains each exposed response separately and
in provider order. The runner has no execution deadline, and neither silence nor
elapsed time indicates failure. It runs until the agent completes or the caller
cancels it. Cancellation ends the agent invocation and returns a failed result
without a response.

## Result

A result is encoded by the runner's exit status and output:

- `responded`: exit `0` and write only the non-empty prompt response or review
  evidence to stdout;
- `unavailable`: exit `2` and write evidence that the agent CLI or a requested
  native capability the runner can establish is unavailable to stderr;
- `failed`: any other non-zero exit and failure evidence on stderr.

`unavailable` and `failed` are [concerns](../protocol.md#concerns).

Only `responded` writes stdout. It confirms transport and response integrity,
not that the response satisfies the caller's task; the caller owns that
validation. When a provider process exits unsuccessfully, its failure evidence
includes any non-empty provider stderr verbatim after the runner-owned summary;
provider stdout is not failure evidence.

A provider reports an unresolved native review command as a successful response
saying the command is unknown, which the runner cannot distinguish from a review
reporting that text. A `responded` review therefore does not establish that a
review ran; the caller judges the evidence.

Review stdout is one JSON object with this versioned shape:

```json
{
  "schema": "remdo.review-evidence.v1",
  "provider": "claude",
  "responses": [
    { "sequence": 1, "status": "completed", "text": "First response" },
    {
      "sequence": 2,
      "status": "failed",
      "text": "Partial response",
      "details": {
        "subtype": "error_max_turns",
        "is_error": true,
        "errors": ["provider diagnostic"]
      }
    },
    { "sequence": 3, "status": "completed", "text": "Later response" }
  ]
}
```

`provider` is `codex` or `claude`. `responses` contains, in provider order,
every supported result with non-empty text and every failed result. Each has
`completed` or `failed` status; a failed response includes provider failure
details—retaining the provider's `errors` field when present—and can omit
`text`. Empty completed results and blank stream lines carry no evidence and are
omitted. The runner does not concatenate, summarize, deduplicate, or select
among responses, and does not expose other provider event traffic. An item can
be a summary, finding, addendum, correction, withdrawal, or lifecycle
notification; no item is guaranteed to be final, complete, exhaustive, or
authoritative. Those are semantic judgements for the review caller.

When a provider exits successfully but its output does not yield a prompt
response or valid review evidence, the failure evidence includes that output
verbatim after the runner-owned summary, so the caller can diagnose an
unrecognized protocol shape from the failure alone.

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
