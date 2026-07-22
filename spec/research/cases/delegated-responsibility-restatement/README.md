# Delegated Responsibility Restatement

This user-raised case records an ownership correction across the
[`remdo-verify-change`](../../../skills/remdo-verify-change.md) and
[read-only agent runner](../../../agents/tools/read-only-runner.md) contracts.

## Pre-change

- [Whole pre-change verifier](pre-change/spec/skills/remdo-verify-change.md)
- [Whole pre-change runner](pre-change/spec/agents/tools/read-only-runner.md)

## Change request

**Challenge:** The verifier contract mixed verifier-owned behavior with
summaries of behavior already owned by the linked runner and provider-specific
review sections. Naming runner responsibilities beside the link duplicated
their owner, increased the reader's reconciliation work, and created another
place for safety, lifecycle, and response semantics to drift. The statement
that a runner response was necessary but insufficient also repeated the runner
result contract and the verifier's later interpretation rules. The provider
sections also repeated runner-owned response-channel and status behavior, and
named Claude's command mapping instead of its native review behavior.

**Agreed actions:** Keep only the verifier's responsibilities in this passage:
constructing scope and instructions, invoking independent Codex and Claude
reviews through the runner, and interpreting completion and findings. Leave
fresh sessions, safety, cancellation, protocol completion, and response
extraction to the runner contract. Leave native review selection to the
provider-specific sections, while leaving response transport, command mapping,
and runner-status classification to their existing owners. Remove summary
statements already expressed by those owners.

## Post-change

- [Whole post-change verifier](post-change/spec/skills/remdo-verify-change.md)
- [Whole post-change runner](post-change/spec/agents/tools/read-only-runner.md)
