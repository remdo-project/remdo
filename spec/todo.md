# RemDo TODO

This file is RemDo's authoritative TODO and sole intake for temporary work
state, known gaps, unresolved decisions, and follow-up work. It does not define
or override accepted target behavior.

The closed [legacy backlog](../docs/legacy-backlog.md) retains unresolved entries
created before this file became the sole intake. Do not add entries there; its
existing entries remain part of duplicate and review-suppression checks until
they are resolved or migrated.

Reviewers treat explicitly recorded gaps as intended temporary state rather than
new findings. Group related notes under short topic headings within their `TODO`
or `FIXME` section. Remove rejected or obsolete notes and empty sections.

## TODO

### Specification feedback ownership

Rename `spec/research/` so its path clearly owns session-derived
specification-authoring feedback cases, then update inbound links. Decide
separately whether durable general research needs a repository owner.

### Agent specification structure

Move `spec/skills/remdo-verify-change.md` under `spec/agents/skills/` and update
all inbound links in the same change.

### Propagate nested results

- Components report facts through their results; their callers decide what
  happens next.
- A future change flow should include the verifier's unavailable or failed
  reviewers in its user-facing task result.

### Fresh-session ownership

Deliberately decide which components run in fresh sessions and whether each
session is started by the caller or the invoked skill.

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
[verifier adapter validation](skills/remdo-verify-change.md#adapter-validation)
and its fixture-pass/real-repository-failure dogfood as the first case. Find a
clearer name before establishing the mechanism.
