## Why

The current OpenSpec flow makes contributors review substantially the same
requirements first as a change delta and later in their durable context. RemDo
needs a spec-first flow that preserves OpenSpec's change history while making
the durable spec the primary review surface before implementation begins.

## What Changes

- Materialize an active change's requirements into its main spec before
  implementation, so accepted target behavior is reviewed in durable context.
- Use the active change tasks as the authoritative record of work still needed
  to make code satisfy the accepted spec.
- Freeze the approved spec during implementation and return to spec review when
  implementation discoveries require contract changes.
- Allow only one active OpenSpec change on a branch, keeping the temporary gap
  record unambiguous.
- Add a RemDo-owned conductor that composes OpenSpec primitives without
  modifying generated OpenSpec workflows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-change-workflow`: Define the spec-first review, implementation,
  revision, and finalization lifecycle for agent-assisted changes.

## Impact

This changes RemDo's documentation invariants, OpenSpec configuration, and
agent workflow instructions. It adds a project-owned workflow conductor over
the existing project-local OpenSpec commands and reconciles the existing
feature flow with it; product behavior and runtime code are unaffected.
