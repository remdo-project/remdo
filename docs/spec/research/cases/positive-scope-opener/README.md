# Positive Scope Opener

This user-raised case records a scope correction in the
[`read-only runner`](../../../agents/tools/read-only-runner.md) contract.

## Pre-change

[Whole pre-change specification](pre-change/spec/agents/tools/read-only-runner.md)

## Change request

**Challenge:** The scope opener listed negated non-goals that did not establish
a valuable boundary. Later adapter evidence also showed that the request implied
uniform support for optional inputs, omitted inherited execution context, and
described only textual final responses.

**Agreed actions:** State the owned behavior positively. Keep a negation or
non-goal only when it prevents a clear misuse of the contract. Qualify optional
inputs by adapter support, preserve the caller's environment behind runner-owned
safety settings, and carry final text or structured output without assigning
meaning to it.

## Post-change

[Whole post-change specification](post-change/spec/agents/tools/read-only-runner.md)
