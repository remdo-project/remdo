# RemDo TODO

This ledger is RemDo's near-term backlog and single entry point for tracked
follow-up. It lists known gaps from
[accepted target behavior](documentation.md#target-behavior), cross-cutting
temporary state, unresolved decisions, and follow-up without a better owner.
Entries do not define accepted behavior.

The closed [legacy backlog](../docs/legacy-backlog.md) holds earlier unresolved
entries. Continue checking its entries for duplicates and review suppression
until they are resolved or migrated.

## Tracked follow-up

Record code-local follow-up in
[tracked comments](../docs/contributing.md#code-comments), long-horizon
follow-up in the owning specification's [`Future`](documentation.md#future)
section, and other work intended to be done soon in this backlog. Together,
these locations form the tracking record; do not duplicate an item between
them.

Reviewers suppress a finding only when it matches the same specific tracked
behavior. Within this backlog, group related items under short topic headings.
Remove rejected or obsolete items and empty sections.

## Backlog

### Documentation

- **Documentation tree consolidation.** Until consolidation, `spec/` routes
  current owners and receives new or materially revised contracts. Existing
  delegated contracts remain in `docs/` or accepted `openspec/specs/`; all
  other OpenSpec artifacts are evidence only. After the documentation contract
  converges, make `docs/` the single documentation root: move component
  contracts from `spec/` to `docs/specs/`, give the remaining `spec/` artifacts
  explicit homes under `docs/`, update routing and inbound links, then remove
  `spec/`.

- **Normative prose migration.** Remove RFC-style uppercase requirement
  keywords from current contract owners and agent skills, preserving
  distinctions expressed by `SHOULD` and `MAY` in ordinary prose. Leave retired
  and archived evidence unchanged.

- **Specification vocabulary review.** Make future specification-authoring and
  review workflows apply the [ownership](documentation.md#ownership) and
  [minimality](documentation.md#minimality) rules to every domain- or
  component-specific term, including consistent actor and component identity.

- **Specification feedback ownership.** Rename `spec/research/` so its path
  clearly owns session-derived specification-authoring feedback cases, then
  update inbound links. Decide separately whether durable general research
  needs a repository owner. Specify when a research artifact may be treated as
  provenance. Distinguish user findings, agent or subagent experiments,
  self-review, and later decisions; decide what source identity and chronology
  must be preserved, and do not treat an unattributed mutable synthesis as
  provenance.

### Agents

- **Runner/verifier implementation alignment.** Align the executable runner,
  verifier skill, and tests with the accepted
  [runner](agents/tools/read-only-runner.md) and
  [verifier](skills/remdo-verify-change.md) contracts before relying on the
  revised flow.

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](documentation.md#empirical-checks).

- **Agent specification structure.** Move the
  [`remdo-verify-change`](skills/remdo-verify-change.md) specification under
  `spec/agents/skills/` and update all inbound links in the same change.

- **Propagate nested results.** Components report facts through their results;
  their callers decide what happens next. A future change flow should include
  the verifier's unavailable or failed reviewers in its user-facing task
  result.

- **Fresh-session ownership.** Deliberately decide which components run in
  fresh sessions and whether each session is started by the caller or the
  invoked skill. Use evidence from real verifier runs, adopting a fresh-subagent
  boundary only if it is more efficient.

- **Verifier deterministic checks.** Decide whether deterministic checks belong
  in `remdo-verify-change`. If they remain, decide whether their selection rules
  are accepted behavior owned by the verifier specification or execution
  procedure owned by the skill.

- **Verifier readiness modes.** Research explicit specification- and
  implementation-readiness modes only if standalone and change-flow use exposes
  recurring ambiguity that reviewer inference cannot resolve reliably.

- **Post-skill retrospectives.** Make an on-demand retrospective available
  after skill runs, using saved session logs to explain elapsed time, repeated
  or costly work, and concrete lessons. Add dedicated orchestration or
  instrumentation only if real retrospectives show that the existing evidence
  is insufficient.

- **Change-flow verification order.** When defining flows that include the
  verifier, decide when deterministic checks and reviews run so neither is
  repeated unnecessarily.

- **Empirical-check execution.** Define when and how implementation work runs a
  specification's empirical checks, records their evidence, and makes it
  available when deciding whether implementation is complete. Define how
  reviewers determine whether that evidence establishes conformance and when
  independent repetition is required. Use the [read-only
  runner](agents/tools/read-only-runner.md#empirical-checks) as the first
  case, including its fixture-pass/real-repository-failure dogfood.
