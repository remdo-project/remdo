## 1. Establish the contract

- [x] 1.1 Materialize the workflow delta in the main
  `development-change-workflow` spec.
- [x] 1.2 Update `docs/documentation.md` so its ownership and status invariants
  describe accepted target specs paired with an active implementation-gap
  record.
- [x] 1.3 Update OpenSpec configuration and agent guidance to route
  spec-bearing changes through the accepted workflow without modifying
  generated OpenSpec assets.

## 2. Implement the conductor

- [ ] 2.1 Add the shared `remdo-change-flow` skill and agent adapters that
  compose the project-local OpenSpec propose, sync, apply, verify, and archive
  primitives.
- [ ] 2.2 Enforce the one-active-change branch gate and the explicit
  specification approval, freeze, revision, and convergence gates.
- [ ] 2.3 Make `remdo-feature-flow` delegate its specification lifecycle to
  `remdo-change-flow` while preserving its feature-specific autonomous
  execution and refinement behavior.

## 3. Verify the workflow

- [ ] 3.1 Add focused automated coverage for deterministic conductor helpers
  and routing behavior.
- [ ] 3.2 Validate the active change strictly and run the repository checks.
