## Context

`remdo-change-flow` owns RemDo's OpenSpec lifecycle, while older skills supply a
diff-oriented review ladder without an explicit specification-readiness mode or
the approved baseline needed for implementation-readiness review. The
replacement needs one lifecycle and an independently owned verifier capability.

## Goals / Non-Goals

**Goals:**

- Make `remdo-change-flow` the sole blessed spec-bearing lifecycle.
- Give `remdo-verify-change` its own durable behavior and permanent design.
- Review specification readiness before approval and implementation readiness
  against the approved baseline before final handoff.
- Preserve useful legacy behavior before deleting superseded skills.

**Non-Goals:**

- Preserve generic diff refinement, retired skill names, or compatibility
  wrappers.
- Make the verifier another lifecycle or approval authority.
- Add CodeRabbit to the initial reviewer set.

## Decisions

### Replace the legacy paths with two owners

Ownership replacement:

```text
[remdo-feature-flow / remdo-refine / remdo-simplify]
                         |
                         v
                [audit + classify]
                    |         |
                    v         v
        [remdo-change-flow] [remdo-verify-change]
```

Replacement validation loop:

```text
[reconcile permanent owners] -> [specification-readiness]
             ^                           |
             +--------- finding ---------+
                                         | ready
                                         v
                            [approval + implementation]
                                         |
                                         v
                                  [survivor audit]
                                     |          |
                             missing |          | complete
                                     v          v
                            [audit + classify] [atomic removal]
                                     |
                                     +--> reconcile permanent owners
```

Add `agent-skill-remdo-verify-change` beside the modified
`development-change-workflow` capability. The verifier owns scope, readiness
modes, reviewer behavior, result semantics, and convergence. The workflow
owns invocation, the approval baseline, lifecycle routing, and user handoff.
The survivor audit sends any missing legacy behavior back through
classification and owner reconciliation before the old skills are removed.

### Review in two modes

Use separate specification-readiness and implementation-readiness modes so
reviewers judge proposal readiness independently from implementation
conformance. The approval commit anchors implementation review.

### Use provider-native review modes

Each adapter uses its provider's native review engine and adds only the selected
readiness lens; repository artifacts supply the detailed intent. The adapter
confirms activation from provider-originated execution evidence rather than
model-authored review content. Exact invocations and activation witnesses remain
adapter details.

### Keep checks outside reviewer processes

Run deterministic checks outside reviewer processes and pass their evidence
into review. This keeps deterministic evidence distinct from independent
judgment.

### Attempt one extensible reviewer wave

Use one extensible concurrent reviewer wave, initially Codex and Claude, so
adapters share inputs while failures remain independently visible. CodeRabbit
is deferred without closing the reviewer interface.

### Preserve explicit result states

Use structured outcomes so an incomplete review cannot be mistaken for clean.
Aggregate reviewer evidence while preserving provenance and dispositions
across coordinator fixes.

The verifier and lifecycle each receive a permanent design beside their main
spec. Those designs own current architecture; this change design records why
the architecture changed and becomes historical after archival. The legacy
skills remain reference material only, never dependencies of blessed skills.

## Risks / Trade-offs

- **Reviewer unavailability weakens evidence** → Preserve successful evidence
  and report each degradation without representing it as clean.
- **Provider changes can silently bypass native review** → Require
  provider-originated activation evidence and prove both successful activation
  and rejection of an ordinary agent response against the installed CLIs.
- **Unbounded reviewer duration can delay a run** → Allow caller cancellation
  and optional caller-owned environmental deadlines without making either a
  verifier policy.
- **Two permanent owners can blur responsibility** → Keep verifier behavior
  and mechanics in its capability; keep only lifecycle integration in the
  workflow capability.
- **Legacy removal can lose edge cases** → Require an explicit disposition
  for every legacy procedure, tool, test, TODO, permission, and inbound
  reference.
