# Development change workflow

This specification defines the lifecycle of an agent-assisted development
change that uses coordinated planning, implementation, and verification. It
owns phase transitions and user handoffs; participating capabilities retain
ownership of their own behavior.

## Coordination

One coordinator owns the end-to-end lifecycle. Supporting capabilities return
their results to that coordinator without advancing the lifecycle or redefining
another capability's contract.

## Planning

Before implementation begins, proposed durable behavior is expressed by its
current [contract owners](../../documentation.md#ownership) and presented for
explicit user approval. Supporting plans and designs may explain the proposal
but do not replace those owners as the review surface.

Approval establishes the intended behavior for implementation. It does not
supply the [authority](../../../AGENTS.md#safety--process) required for
repository actions.

## Implementation

Implementation brings the repository into conformance with the approved
behavior without changing that behavior. If implementation reveals that the
intended behavior must change, the workflow stops implementation and returns
the revised contract owners for renewed approval before continuing.

## Verification and handoff

Before presenting implementation as complete, the coordinator obtains
verification evidence for the current change against the approved contracts.
It presents the verified scope and result to the user before requesting any
authorization needed to commit or otherwise advance the change.
