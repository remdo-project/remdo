## 1. Build readiness verification

- [ ] 1.1 Create `remdo-verify-change` with exclusive uncommitted or clean
  Git-range scope, mixed-scope refusal, required review mode, and the immutable
  implementation approval baseline.
- [ ] 1.2 Implement specification-readiness and implementation-readiness lens
  assembly with repository-authoritative intent discovery, cited sources and
  evidence, read-only review, and no reviewer-owned checks.
- [ ] 1.3 Implement structured Codex and Claude external-process adapters with
  provider-native review modes, fresh sessions, isolated startup that preserves
  native review, read-only tool boundaries, no verifier-owned timeout, portable
  reviewer inputs, and provider-originated activation evidence.
- [ ] 1.4 Keep the coordinator read-only while attempting both reviewers
  concurrently over the current in-place candidate, wait for every process
  unless cancelled, and preserve valid evidence plus each reviewer degradation
  independently.
- [ ] 1.5 Implement clean, findings, and incomplete or failed result states;
  provenance-preserving deduplication; coordinator-owned dispositions and
  fixes; and rejected-finding and degradation retention.
- [ ] 1.6 Run applicable deterministic checks outside reviewer processes and
  repeat checks and the complete review wave after an accepted fix changes the
  candidate.
- [ ] 1.7 Add behavioral tests for scope and review-mode resolution, mixed-scope
  refusal, missing modes and baselines, adapter permissions and hook isolation,
  missing or failed executables, cancellation, malformed output, native-review
  activation, ordinary-response rejection, independent availability,
  complete-wave barriers, finding evidence and dispositions, convergence, and
  repository guards.

## 2. Integrate the single lifecycle

- [ ] 2.1 Update `remdo-change-flow` to invoke specification-readiness review
  before contract approval and implementation-readiness review against the
  approved baseline before final user handoff.
- [ ] 2.2 Route planning findings to artifact reconciliation and renewed
  readiness review; route implementation findings to implementation or renewed
  specification approval according to the affected owner.
- [ ] 2.3 Make permanent capability designs part of reconciliation, approval,
  baseline recording, implementation inputs, and final convergence; preserve
  archived change designs as historical context.
- [ ] 2.4 Present reviewer activity, degradations, sources, dispositions,
  trade-offs, coverage gaps, and deterministic-check evidence at final handoff;
  send user-requested fixes through a new verification run.
- [ ] 2.5 Bind implementation-commit authorization to the verified candidate,
  recheck the committed state, and require separate authorization before
  archival.
- [ ] 2.6 Update agent guidance, contributor documentation, skill metadata
  guards, and related tests so `remdo-change-flow` is the sole blessed
  end-to-end spec-bearing workflow.

## 3. Retire superseded skills

- [ ] 3.1 Relocate independently valid scope-resolution behavior and its tests
  to a neutral owner, then update retained callers.
- [ ] 3.2 Audit every procedure, tool, test, metadata file, TODO, permission, and
  inbound reference owned by `remdo-feature-flow`, `remdo-refine`, and
  `remdo-simplify`; classify each as reimplemented, relocated, or obsolete.
- [ ] 3.3 Delete the three superseded skill directories without compatibility
  wrappers or legacy aliases.
- [ ] 3.4 Remove or update all live repository references and follow-ups for the
  retired skills while preserving archived change history.

## 4. Prove the replacement

- [ ] 4.1 Exercise both readiness modes through the installed Codex and Claude
  CLIs, preserve provider-originated native-review activation evidence, then run
  non-review negative controls and confirm they fail closed without candidate
  edits.
- [ ] 4.2 Run the new verifier over this change and resolve accepted findings
  until final-candidate checks pass and no accepted findings remain.
- [ ] 4.3 Confirm implementation and tests satisfy both capability specs and
  permanent designs in both directions and every legacy artifact has a
  recorded disposition.
- [ ] 4.4 Run strict OpenSpec validation and all repository checks required by
  `AGENTS.md`.
