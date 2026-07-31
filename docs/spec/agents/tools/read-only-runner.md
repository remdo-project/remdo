# Read-only runner

The read-only runner maps one prompt or native review invocation to a fresh
Codex or Claude CLI session rooted at the caller's current Git repository. It
owns CLI invocation, repository protection, protocol completion, and
final-response extraction; callers own the meaning of the response.

## Call

```text
read-only-runner [options] <agent> <invocation>
```

- `<agent>`: `codex` or `claude`.
- `<invocation>`:
  - `prompt <prompt>`
  - `review <scope>`
- `<scope>`: a resolved
  [change scope](../change-scope.md), encoded as:
  - `uncommitted`
  - `commit-range <base>`
- `--model <model>`: optional model value.
- `--effort <effort>`: optional effort value.

The runner forwards supplied model and effort values to the agent unchanged and
leaves absent values unset, so the agent applies its own default.

## Invocations

**Prompt.** The runner passes the prompt to the agent's non-interactive session
unchanged.

**Review.** The runner gives each agent's native review the resolved scope
exactly: `uncommitted` covers every staged, unstaged, and untracked changed
path and nothing from committed branch history, and `commit-range` covers
`base` through the commit `HEAD` names when the invocation begins, so a later
commit cannot widen it.

A review uses the native command's instructions and the repository guidance its
session loads. The runner additionally instructs the reviewing agent and every
reviewer it delegates to not to run repository checks.

## Repository protection

An invocation does not change the caller's Git repository, and does not act
outside it by publishing, scheduling, or establishing persistent monitoring,
notification, or remote control.

An invocation retains the inspection access its task requires, including
complete Git history and repository state.

Each invocation provides one of two protection levels, fixed by its agent. The
caller chooses an agent whose level suits the prompt it supplies.

### Enforced

The invocation cannot change the repository, whatever the prompt asks. Codex
invocations are enforced: the runner invokes Codex under a read-only sandbox
that denies approval of any escalation.

### Trusted prompt

The invocation does not change the repository when the prompt does not seek to.
Claude invocations are trusted-prompt: shell access remains available so review
can inspect Git completely, and a shell reaches any effect a restriction on
other tools would prevent, so the runner restricts no tool and offers no
guarantee at this level.

The caller supplies a prompt it trusts not to seek mutation, and owns that
judgement. A vendor-owned command documented as read-only meets this; an
untrusted prompt does not.

## Lifecycle

The invocation observes repository state present when it begins. The caller
keeps that state unchanged when it requires consistency for the whole
invocation.

Each invocation makes one attempt in a non-persistent session; retry belongs to
the caller. The runner waits without a ceiling for background subagents and
workflows the review delegates to, so their results remain part of the final
response rather than a pending-task notification. The runner has no execution
deadline, and neither silence nor elapsed time indicates failure. It runs until
the agent completes or the caller cancels it. Cancellation ends the agent
invocation and returns a failed result without a response.

## Result

A result is encoded by the runner's exit status and output:

- `responded`: exit `0` and write only the non-empty complete final text to
  stdout;
- `unavailable`: exit `2` and write evidence that the agent CLI or requested
  native capability is unavailable to stderr;
- `failed`: any other non-zero exit and failure evidence on stderr.

Only `responded` writes stdout. It confirms transport and response integrity,
not that the response satisfies the caller's task; the caller owns that
validation. When a provider process exits unsuccessfully, its failure evidence
includes any non-empty provider stderr verbatim after the runner-owned summary;
provider stdout is not failure evidence.

## Empirical checks

- Each agent's review inspects the complete resolved scope, repository
  guidance, Git context, and referenced files, and reviews the scope the runner
  resolved rather than one the agent selects itself. A review whose inspection
  access is incomplete still reports findings and reports success, so this is
  confirmed by observing the review's reach rather than its result.
- Review invocations, including delegated reviewers, do not run repository
  checks.
- Invocations leave the repository unchanged and cause no outside effect.
  Provider documentation defines each restriction in isolation, not whether the
  combination holds for a session that can reach mutation through an
  unrestricted path, so conformance is confirmed by observing repository state.

## Future

Enforced Claude invocations, so a caller can supply a prompt it does not trust.
The provider sandbox that would enforce them requires host tools beyond the
agent binary, and refuses to start when they are absent; adopting it makes those
tools a runtime requirement of every invocation, including review, which does
not need them.

## References

- [Claude Code: background tasks at exit](https://code.claude.com/docs/en/headless#background-tasks-at-exit)
  — print-mode waiting behavior for background subagents and workflows.
