# Read-only agent runner

The read-only agent runner executes one provider-native command in a fresh agent
session rooted at the caller's current repository. It reports the invocation's
status and evidence for the caller to interpret.

## Request

The caller selects a supported agent adapter and supplies one native command,
its ordered arguments, and any adapter-supported execution settings,
instructions, or final-response schema. The adapter preserves the caller's
environment and owns the executable and all isolation, permission, session, and
output-capture settings; caller-controlled values cannot replace or weaken
them.

The command observes the repository state present when invocation begins. The
caller owns any stronger consistency requirement, including keeping that state
unchanged for the duration of the command.

## Read-only operation

The invocation does not change repository state, including working-tree files,
the index, untracked files, or Git references. Adapter-private temporary output
outside the repository and communication with the agent's model service are not
repository changes.

Each adapter has one declared isolation level:

- **Enforced:** a technical boundary prevents the agent's tools from writing to
  the repository.
- **Cooperative:** permissions, available tools, and instructions require
  read-only behavior, but a trusted agent remains part of the boundary.

The Codex adapter is enforced. The Claude adapter is cooperative because its
native commands require tool execution that is not contained by a repository
write boundary. An adapter never silently weakens its declared level.

Every invocation starts a new non-persistent agent session. Startup behavior,
including hooks and configuration loading, follows the same read-only contract
as the command. The adapter performs one attempt; retry policy belongs to the
caller.

## Completion

An invocation has responded only when the provider process and protocol finish
cleanly and yield one non-empty final response. The response is final text or
schema-validated structured output, according to the request, and the adapter
returns it intact. Intermediate execution, transport completion alone, and a
process exit without a usable final response do not establish this state.

Responded describes the invocation, not the meaning of its response. Findings,
refusals, and explanations that the requested operation could not complete are
response content for the caller to interpret. Schema validation establishes
response shape; the caller assigns meaning to its fields.

## Result

The result has one status:

- `responded`, with the complete final response;
- `unavailable`, when the selected agent executable cannot be invoked; or
- `failed`, with relevant diagnostic evidence when invocation did not produce a
  trustworthy final response.

Only `responded` carries a response. Normal operation exposes no intermediate
execution; intermediate output is diagnostic evidence for a failed invocation
or intentional debugging.

## Adapter validation

When an adapter is added or changed, automated contract tests cover its request
forwarding, fixed safety settings, final-response extraction, and failure
classification. End-to-end validation invokes a real native command and proves
that startup and command execution leave repository state unchanged.

Validation of an enforced adapter includes a rejected write attempt. Validation
of a cooperative adapter proves observed read-only behavior without claiming
adversarial containment. Any silent isolation downgrade or missing completion
proof fails validation.
