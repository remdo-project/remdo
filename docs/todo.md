# RemDo TODO

This ledger is RemDo's near-term backlog and single entry point for tracked
follow-up. It lists known gaps from
[accepted target behavior](documentation.md#target-behavior), cross-cutting
temporary state, unresolved decisions, and follow-up without a better owner.
Entries do not define accepted behavior.

The closed [legacy backlog](legacy-backlog.md) holds earlier unresolved
entries. Continue checking its entries for duplicates and review suppression
until they are resolved or migrated.

## Tracked follow-up

Record code-local follow-up in
[tracked comments](contributing.md#code-comments), long-horizon
follow-up in the owning specification's [`Future`](documentation.md#future)
section, and other work intended to be done soon in this backlog. Together,
these locations form the tracking record; do not duplicate an item between
them.

Reviewers suppress a finding only when it matches the same specific tracked
behavior. Within this backlog, group related items under short topic headings.
Remove rejected or obsolete items and empty sections.

## Backlog

### Documentation

- **Specification consolidation.** Review existing documents and capabilities
  in the [legacy OpenSpec migration record](../openspec/MIGRATION.md) one by one.
  Move each actual specification into `docs/spec/`, leaving other documentation
  elsewhere under `docs/`. Move the complete contract, update inbound links,
  and remove its former normative definition in the same change. Other OpenSpec
  artifacts remain evidence only.

- **Normative prose migration.** Remove RFC-style uppercase requirement
  keywords from current contract owners and agent skills, preserving
  distinctions expressed by `SHOULD` and `MAY` in ordinary prose. Leave retired
  and archived evidence unchanged.

- **Specification vocabulary review.** Make future specification-authoring and
  review workflows apply the [ownership](documentation.md#ownership) and
  [minimality](documentation.md#minimality) rules to every domain- or
  component-specific term, including consistent actor and component identity.

- **Specification feedback ownership.** Rename `docs/spec/research/` so its path
  clearly owns session-derived specification-authoring feedback cases, then
  update inbound links. Decide separately whether durable general research
  needs a repository owner. Specify when a research artifact may be treated as
  provenance. Distinguish user findings, agent or subagent experiments,
  self-review, and later decisions; decide what source identity and chronology
  must be preserved, and do not treat an unattributed mutable synthesis as
  provenance.

### Agents

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](documentation.md#empirical-checks).

- **Agent specification structure.** Move the
  [`remdo-verify-change`](spec/skills/remdo-verify-change.md) specification
  under `docs/spec/agents/skills/` and update all inbound links in the same
  change.

- **Propagate nested results.** Components report facts through their results;
  their callers decide what happens next. A future change flow should include in
  its user-facing task result the verifier's unavailable or failed reviewers
  and [finding dispositions](spec/skills/remdo-verify-change.md#findings), plus
  confirmed findings convergence could not correct.

- **Fresh-session ownership.** Deliberately decide which components run in
  fresh sessions and whether each session is started by the caller or the
  invoked skill. Use evidence from real verifier runs, adopting a fresh-subagent
  boundary only if it is more efficient.

- **Deterministic-check ownership.** Choose the single component and lifecycle
  point that runs authoritative repository checks. Define check selection and
  unrelated-failure handling there; other workflow components consume the result
  without repeating the checks.

- **Verifier readiness modes.** Research explicit specification- and
  implementation-readiness modes only if standalone and change-flow use exposes
  recurring ambiguity that reviewer inference cannot resolve reliably.

- **Post-skill retrospectives.** Make an on-demand retrospective available
  after skill runs, using saved session logs to explain elapsed time, repeated
  or costly work, and concrete lessons. Add dedicated orchestration or
  instrumentation only if real retrospectives show that the existing evidence
  is insufficient.
