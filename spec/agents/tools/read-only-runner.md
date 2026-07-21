# Read-only agent runner

The read-only agent runner executes one supported Codex or Claude operation in
a fresh session rooted at the caller's current Git repository. It owns provider
startup, repository isolation, completion proof, and final-response extraction;
the caller owns what the response means.

## Request

Every request selects an adapter, one adapter-specific invocation, a text or
structured response, and optional adapter-supported model and effort settings.
The TypeScript API exposes provider-specific discriminated request types.
Structured requests carry the provider-facing JSON Schema; the runner forwards
it, returns the provider's parsed value, and leaves contract validation to the
caller.

The closed invocation dialects are:

- **Codex:** a prompt, or native review of the working tree or `HEAD` relative
  to one base commit. Prompts support text and structured responses. Native
  review supports text only because its provider surface does not honor a
  response schema.
- **Claude:** a prompt, or a review invocation with optional arguments and
  caller instructions. The adapter maps review to native `/code-review`. Both
  variants support text and structured responses.

Callers cannot supply raw provider arguments or replace adapter-owned sandbox,
permission, tool, hook, configuration, persistence, temporary-output, or
response-capture settings. Safety-relevant Git path redirection variables are
removed; the remaining caller environment is preserved with private temporary
paths overlaid outside the repository.

The command observes repository state present when invocation begins. The
caller owns any stronger consistency requirement, including keeping that state
unchanged for the duration of the command.

## Read-only operation

The invocation does not change repository files, the index, untracked files,
Git metadata, or references. Adapter-private temporary output outside the
repository and communication with the model service are allowed. Every
invocation makes one attempt in a non-persistent session; retry belongs to the
caller.

The Codex adapter delegates write prevention to Codex's read-only sandbox. It
uses the caller's normal Codex home and authentication, which Codex may update
as part of ordinary operation. The adapter ignores user configuration and
execution rules, disables hooks and apps, fixes approval to `never`, selects
Codex's read-only sandbox, and disables session persistence. This is
provider-owned enforcement for model-generated operations, not runner-owned
containment of the complete Codex process. The runner trusts Codex to initialize
and preserve that sandbox.

The Claude adapter is cooperative. Prompt operations expose only
`Bash,Read,Grep,Glob`; native review additionally exposes `Skill,Agent`. Both
use `dontAsk`, a runner-owned read-only system instruction, disabled hooks, an
empty strict MCP configuration, disabled Chrome integration, and no session
persistence. Caller instructions cannot remove the read-only instruction.

A runner invocation has no execution deadline and may remain silent for an
unspecified time. It runs until the provider process and protocol complete or
the caller explicitly cancels it. Executable fronts translate `SIGINT` and
`SIGTERM` into cancellation. Cancellation terminates the provider process group
and produces no response. A provider descendant that deliberately detaches from
that group is outside this lifecycle guarantee.

Callers monitor invocations through their runtime's managed completion signal or
callback. They do not poll the process or infer failure from elapsed time or a
lack of output. A caller that needs its own lifecycle deadline implements that
policy by explicitly cancelling the invocation; it is not part of the runner
request or result contract.

## Completion

An invocation has responded only when the provider process and protocol finish
cleanly and yield one non-empty final response.

For Codex, exit status zero and a non-empty final-message file are required.
The runner trusts Codex's final-message channel as the complete response;
missing or empty output fails the invocation.

For Claude, exit status zero and a successful result envelope are required.
Text comes from its non-empty `result`; structured output comes from
`structured_output`. An exact unknown response for the adapter-owned review
capability means that capability is unavailable.

The adapter returns only the final text or parsed structured value on success.
Intermediate provider output is internal to response extraction and is not part
of any result; provider standard error is discarded. Responded describes
transport and response integrity, not semantic success: findings, refusals, and
explanations that work could not complete are response content for the caller
to interpret.

## Result

The result has one status:

- `responded`, with the complete final response;
- `unavailable`, when the provider executable or an adapter-owned provider
  capability is unavailable; or
- `failed`, with a concise runner-generated classification when an attempted
  invocation did not produce a trustworthy final response.

Only `responded` carries a response.

## Validation

Automated contract tests cover fixed safety settings, scope forwarding,
process-group cancellation, final-response extraction, caller-owned response
validation, and failure classification. End-to-end validation invokes real
provider operations and fingerprints repository files, the index, untracked
contents, and Git references before and after.

Codex validation includes a rejected in-turn write through its provider-owned
read-only sandbox. Claude validation includes a conflicting write request that
the cooperative profile refuses without attempting a write.
