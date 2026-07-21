# RemDo TODO

This file is RemDo's temporary-work ledger. It records known divergences from
[accepted target behavior](documentation.md#target-behavior), cross-cutting
temporary state, unresolved decisions, and follow-up work without a better
colocated owner. Entries acknowledge incomplete work without defining or
changing accepted target behavior.

The closed [legacy backlog](../docs/legacy-backlog.md) retains unresolved entries
created before this file became the active ledger. Do not add entries there; its
existing entries remain part of duplicate and review-suppression checks until
they are resolved or migrated.

Reviewers treat explicitly recorded gaps as intended temporary state rather than
new findings. Group related notes under short topic headings within their `TODO`
or `FIXME` section. Remove rejected or obsolete notes and empty sections.

## Work markers

Tracked follow-up work uses `FIXME` when the current state contains a defect and
`TODO` otherwise.

Code-local follow-up remains in tracked comments under the
[contributor guidance](../docs/contributing.md#code-comments) and is not
duplicated here.

## TODO

### Documentation tree consolidation

Until consolidation, `spec/` routes current owners and receives new or
materially revised contracts. Existing delegated contracts remain in `docs/`
or accepted `openspec/specs/`; all other OpenSpec artifacts are evidence only.

After the documentation contract converges, make `docs/` the single
documentation root: move component contracts from `spec/` to `docs/specs/`,
give the remaining `spec/` artifacts explicit homes under `docs/`, update
routing and inbound links, then remove `spec/`.

### Normative prose migration

Remove RFC-style uppercase requirement keywords from current contract owners
and agent skills, preserving distinctions expressed by `SHOULD` and `MAY` in
ordinary prose. Leave retired and archived evidence unchanged.

### Specification feedback ownership

Rename `spec/research/` so its path clearly owns session-derived
specification-authoring feedback cases, then update inbound links. Decide
separately whether durable general research needs a repository owner.

Specify when a research artifact may be treated as provenance. Distinguish
user findings, agent or subagent experiments, self-review, and later decisions;
decide what source identity and chronology must be preserved, and do not treat
an unattributed mutable synthesis as provenance.

### Agent specification structure

Move the [`remdo-verify-change`](skills/remdo-verify-change.md) specification
under `spec/agents/skills/` and update all inbound links in the same change.

### Propagate nested results

- Components report facts through their results; their callers decide what
  happens next.
- A future change flow should include the verifier's unavailable or failed
  reviewers in its user-facing task result.

### Fresh-session ownership

Deliberately decide which components run in fresh sessions and whether each
session is started by the caller or the invoked skill. Use evidence from real
verifier runs, adopting a fresh-subagent boundary only if it is more efficient.

### Verifier deterministic checks

Decide whether deterministic checks belong in `remdo-verify-change`. If they
remain, decide whether their selection rules are accepted behavior owned by the
verifier specification or execution procedure owned by the skill.

### Verifier readiness modes

Research explicit specification- and implementation-readiness modes only if
standalone and change-flow use exposes recurring ambiguity that reviewer
inference cannot resolve reliably.

### Post-skill retrospectives

Make an on-demand retrospective available after skill runs, using saved session
logs to explain elapsed time, repeated or costly work, and concrete lessons.
Add dedicated orchestration or instrumentation only if real retrospectives show
that the existing evidence is insufficient.

### Change-flow verification order

When defining flows that include the verifier, decide when deterministic checks
and reviews run so neither is repeated unnecessarily.

### Phase-specific checks

Consider specification rules for checks that run only at the lifecycle phase
where they provide value, such as end-to-end adapter validation during skill
implementation. Use
[verifier validation](skills/remdo-verify-change.md#validation)
and its fixture-pass/real-repository-failure dogfood as the first case. Find a
clearer name before establishing the mechanism.
