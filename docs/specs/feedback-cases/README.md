# Specification Feedback Cases

This directory records non-normative feedback cases about how RemDo
specifications are written. This README defines how that evidence is structured
and maintained. The evidence does not define accepted behavior or
[documentation rules](../../documentation.md).

The current contracts represented by this evidence are
[`remdo-verify-change`](../agents/skills/remdo-verify-change.md) and the [read-only runner](../agents/tools/read-only-runner.md).

A **feedback case** preserves evidence for later specification research and
testing. `Post-change` is the version considered a better fit for the recorded
change request. A case does not claim that version is canonical, generally
applicable, or ideal.

Research should consider both referenced source sessions and broader relevant
historical-log searches as additional evidence.

## Provenance

Every indexed case is provenance of its recorded feedback event. It does not
establish that the challenge is correct or that `Post-change` became accepted policy.

A case identifies the affected activity and attributes the feedback to its
origin: user feedback, an agent or subagent experiment, or self-review. Include
a stable source reference when available, but an attributed case remains
provenance without one. When a case records a later decision, distinguish its
actor from the origin of the observation.

`Pre-change`, `Change request`, and `Post-change` preserve the required
chronology; timestamps and intermediate interaction history are not required.
An unattributed mutable synthesis is not provenance.

## Case shape

Every case has the same logical parts regardless of its file and directory
layout. The simplest representation makes them explicit in one Markdown file:

```markdown
# Case name

Identify the affected artifact and activity, attribute the feedback, and name a
stable source when available.

## Pre-change

Preserve verbatim the altered content and enough surrounding context to
understand the state used as input to the improvement.

## Change request

**Challenge:** Distill what the user or agent questioned about the pre-change
state.

**Agreed actions:** Record the key improvement or action points agreed for the
post-change state.

## Post-change

Preserve the same material and context verbatim in the resulting state so the
two snapshots can be diffed directly.
```

Create or amend a case only when the user explicitly asks to record or refine
that case; a request to change its source material does not authorize changing
the case. During requested case work, preserve all previously captured
`Pre-change` material. Expand or reorganize it as needed — including adding
context or artifacts or changing the case layout — but do not rewrite, correct,
shorten, update, or remove the original material. After each requested
iteration, rewrite `Change request` to include all still-relevant challenges
and agreed actions, then replace `Post-change` with the current version of
everything covered by `Pre-change`.

Outside such a request, every case is frozen. Later changes to its source
material, including moved link destinations, do not update it. Current
navigation belongs in this README.

These are logical parts, not required filesystem boundaries. Use one
descriptively named file under `cases/` when excerpts provide enough evidence.
For changes spanning multiple artifacts, use this layout:

```text
cases/case-name/
├── README.md
├── pre-change/
└── post-change/
```

The README identifies the affected artifacts and holds the change request and
pointers to the snapshots. The two subtrees hold the verbatim evidence. Index
every case below.

## Guidance

No guidance has been promoted. Promote a lesson only when cases, research, or
established practice provide sufficient evidence. When it becomes a durable
rule, move it to [Documentation](../../documentation.md) and remove it here.

## Cases

- [Component vocabulary](cases/component-vocabulary.md) — one verifier input
  was described by three competing terms before adopting `scope` consistently.
- [Text flow connectivity](cases/text-flow-connectivity.md) — an aligned text
  diagram implied branches and joins that continuous connectors made explicit.
- [Section responsibility](cases/section-responsibility.md) — verification flow
  and result behavior were interleaved before each received a clear owner.
- [Result contract concision](cases/result-contract-concision.md) — the verifier
  result contract was shortened while retaining its key boundaries.
- [Positive scope opener](cases/positive-scope-opener/README.md) — a runner
  contract replaced unneeded negated non-goals with a positive statement of
  owned behavior.
- [Delegated responsibility restatement](cases/delegated-responsibility-restatement/README.md)
  — a verifier stopped summarizing behavior owned by its linked runner and
  provider-specific sections.
