## Why

RemDo's final change verification checks specification convergence, while its
independent review ladder predates OpenSpec and reviews only a diff without the
approved intent behind it. A single OpenSpec-aware verification path should
prove contract compliance, test coverage, code quality, and repository health
against one final implementation state before the user reviews it.

## What Changes

- Add a dedicated verifier capability for specification-readiness and
  implementation-readiness review over either a clean Git range or current
  uncommitted changes, with explicit result and degradation semantics.
- Integrate that verifier into the development change workflow before contract
  approval and during final implementation verification.
- Run required independent reviews through provider-native, read-only external
  review modes, and keep their current orchestration in the permanent design
  beside the workflow spec.
- Replace the overlapping `remdo-feature-flow`, `remdo-refine`, and
  `remdo-simplify` skills; blessed skills do not invoke the retired skills.
- Reuse only independently valid primitives after assigning them a non-legacy
  owner and verifying their behavior; audit every retired artifact before
  deletion.

## Capabilities

### New Capabilities

- `agent-skill-remdo-verify-change`: Define readiness review, native-review
  activation, reviewer availability, result classification, and convergence
  behavior for the supporting verifier skill.

### Modified Capabilities

- `development-change-workflow`: Define how the lifecycle supplies resolved
  scope, review mode, and approved baseline to the verifier, and how it
  consumes the result.

## Impact

- Adds a verifier capability spec and permanent design; affects the development
  workflow spec and permanent design, `remdo-change-flow`, agent guidance,
  skill metadata and tests, and callers or references to the retired skills.
- Removes `remdo-feature-flow`, `remdo-refine`, and `remdo-simplify` after their
  useful behavior is accounted for.
- May relocate shared scope-resolution tooling used by retained skills without
  preserving a runtime dependency on a retired skill.
