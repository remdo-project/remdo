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

The runner forwards supplied model and effort values unchanged through the
agent's corresponding CLI settings and leaves absent settings unset.

## Invocations

**Prompt.** For Codex, the runner invokes `codex exec`; for Claude, it invokes
`claude -p`.

**Review.** For Codex, the runner maps `uncommitted` to native review with
`--uncommitted` and `commit-range` to `--base <base>`. For Claude, it maps
`uncommitted` to native `/code-review` with each staged, unstaged, or untracked
changed path as a target, without adding paths solely from committed branch
history. It maps `commit-range` to native `/code-review` for `<base>..HEAD`
after resolving the current `HEAD` commit. Both reviews use the native
command's instructions and repository guidance loaded by the agent session.
The runner additionally instructs the reviewing agent and every reviewer it
delegates to not to run repository checks.

## Repository protection

An invocation does not change the caller's Git repository.

The runner invokes Codex in its read-only sandbox with approval fixed to
`never`. Claude prompt invocations receive a read-only instruction. Claude
review invokes native `/code-review` without mutation flags; Claude's
permissions are not a security boundary.

## Lifecycle

The invocation observes repository state present when it begins. The caller
keeps that state unchanged when it requires consistency for the whole
invocation.

Each invocation makes one attempt in a non-persistent session; retry belongs to
the caller. Claude review's provider-level wait for background subagents and
workflows has no ceiling, so their results remain part of the final response.
The runner has no execution deadline, and neither silence nor elapsed time
indicates failure. It runs until the agent completes or the caller cancels it.
Cancellation ends the agent invocation and returns a failed result without a
response.

## Result

A result is encoded by the runner's exit status and output:

- `responded`: exit `0` and write only the non-empty complete final response
  text to stdout, including any non-empty structured findings delivered
  separately from the provider's terminal text;
- `unavailable`: exit `2` and write evidence that the agent CLI or requested
  native capability is unavailable to stderr;
- `failed`: any other non-zero exit and failure evidence on stderr.

Only `responded` writes stdout. It confirms transport and response integrity,
not that the response satisfies the caller's task; the caller owns that
validation. When a provider process exits unsuccessfully, its failure evidence
includes any non-empty provider stderr verbatim after the runner-owned summary;
provider stdout is not failure evidence.

## Empirical checks

- Native Codex and Claude reviews can inspect the complete resolved scope,
  repository guidance, Git context, and referenced files.
- Codex native review honors the resolved immutable `base` as the exact
  commit-range scope.
- Claude native review honors the exact resolved commit-range scope.
- Claude waits for background review work and returns its result rather than a
  pending-task notification.
- Claude native `uncommitted` review can inspect every resolved changed path
  without adding committed branch history to the scope.
- Codex and Claude review invocations, including delegated reviewers, do not run
  repository checks.
- Claude prompt and review invocations leave the repository unchanged under the
  runner's cooperative protection.

## References

- [Claude Code: background tasks at exit](https://code.claude.com/docs/en/headless#background-tasks-at-exit)
  — print-mode waiting behavior for background subagents and workflows.
