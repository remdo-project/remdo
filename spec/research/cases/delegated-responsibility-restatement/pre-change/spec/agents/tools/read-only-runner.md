# Read-only agent runner

The read-only agent runner starts one invocation in a fresh external Codex or
Claude CLI session rooted at the caller's current Git repository. It owns CLI
startup, repository protection, and invocation completion.

## Call

```text
runReadOnlyAgent(
  { adapter, invocation, response, settings? },
  { cwd?, environment?, signal? }?,
) -> ReadOnlyAgentResult
```

`?` marks optional fields.

- `request.adapter`: `codex` or `claude`.
- `request.invocation`:
  - Codex: `prompt` with `prompt`, or `review` with a `working-tree` target
    or `base` commit.
  - Claude: `prompt` with `prompt`, or `review` with `instructions` and
    `arguments?`.
- `request.response`:
  - Codex prompts: `text` or `structured` with `schema`; Codex reviews:
    `text`.
  - Claude prompts and reviews: `text` or `structured` with `schema`.
- `request.settings?`:
  - Codex: `model?` and `reasoningEffort?`.
  - Claude: `model?` and `effort?`.

`schema` is the provider-facing JSON Schema. A structured response returns the
provider's parsed value.

`cwd` and `environment` default to the calling process. `signal` cancels the
invocation. The runner owns provider arguments and safety settings; callers
cannot replace them.

## Repository protection

An invocation does not change the caller's Git repository.

Codex enforces repository protection through its read-only sandbox with
approval fixed to `never`. Claude cooperates through a runner-owned read-only
instruction; its permissions are not a security boundary.

## Lifecycle

The invocation observes repository state present when it begins. The caller
keeps that state unchanged when it requires consistency for the whole
invocation.

Each invocation makes one attempt in a non-persistent session; retry belongs to
the caller. The runner has no execution deadline, and neither silence nor
elapsed time indicates failure. It runs until the provider completes or the
caller cancels it. Cancellation ends the provider invocation and returns a
failed result without a response.

## Result

`ReadOnlyAgentResult` has one status:

- `responded`, with the complete final text or parsed structured response;
- `unavailable`, with evidence that the provider executable or a supported
  provider capability is unavailable; or
- `failed`, with concise evidence that the invocation did not produce a
  trustworthy final response.

Only `responded` carries a response. It confirms transport and response
integrity, not that the response satisfies the caller's task; the caller owns
that validation.
