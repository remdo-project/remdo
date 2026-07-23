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
  [review scope](../../skills/remdo-verify-change.md#scope), encoded as:
  - `working-tree`
  - `committed-range <base>`
- `--model <model>`: optional model value.
- `--effort <effort>`: optional effort value.

The runner forwards supplied model and effort values unchanged through the
agent's corresponding CLI settings and leaves absent settings unset.

## Invocations

**Prompt.** For Codex, the runner invokes `codex exec`; for Claude, it invokes
`claude -p`.

**Review.** For Codex, the runner maps `working-tree` to native review with
`--uncommitted` and `committed-range` to `--base <base>`. For Claude, it maps
`working-tree` to native `/code-review`, excluding committed branch history,
and `committed-range` to native `/code-review` for `<base>..HEAD` after
resolving the current `HEAD` commit. Both reviews use the native command's
instructions and repository guidance loaded by the agent session.

## Repository protection

An invocation does not change the caller's Git repository.

The runner invokes Codex in its read-only sandbox with approval fixed to
`never`. It supplies Claude a read-only instruction; Claude's permissions are
not a security boundary.

## Lifecycle

The invocation observes repository state present when it begins. The caller
keeps that state unchanged when it requires consistency for the whole
invocation.

Each invocation makes one attempt in a non-persistent session; retry belongs to
the caller. The runner has no execution deadline, and neither silence nor
elapsed time indicates failure. It runs until the agent completes or the caller
cancels it. Cancellation ends the agent invocation and returns a failed result
without a response.

## Result

A result is encoded by the runner's exit status and output:

- `responded`: exit `0` and write only the non-empty complete final text to
  stdout;
- `unavailable`: exit `2` and write evidence that the agent CLI or requested
  native capability is unavailable to stderr;
- `failed`: any other non-zero exit and concise failure evidence on stderr.

Only `responded` writes stdout. It confirms transport and response integrity,
not that the response satisfies the caller's task; the caller owns that
validation.

## Empirical checks

- Runner-owned arguments preserve each agent's native review behavior and its
  ability to inspect the complete scope, repository guidance, Git context, and
  referenced files.
- Codex accepts the resolved immutable `base` commit through `--base` and
  reviews exactly the committed-range scope.
- Claude executes `/code-review` through non-interactive `claude -p`.
- Claude reviews exactly the committed-range scope.
- Claude `working-tree` review includes the complete working-tree scope and
  excludes committed branch history on branches with and without existing
  upstream configuration.
- Claude prompt and review invocations leave the repository unchanged under the
  runner's cooperative protection.
