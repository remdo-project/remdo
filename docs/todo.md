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
  artifacts remain evidence only. Per-spec recipe (refine as migrations teach
  more; `outliner-list-types` was the first):

  1. Recover the pre-OpenSpec original from its deletion commit
     (`docs/outliner/reordering.md`: `b90aa1a9`;
     `docs/outliner/note-structure-rules.md`, indentation: `0de8244d`).
  2. Diff it against the current `openspec/specs/` version, using the archived
     change's `design.md` to separate deliberate drops from accidental ones.
  3. Verify any semantic drift between the versions against the
     implementation.
  4. Rewrite in `docs/spec/` form per [documentation](documentation.md),
     checked clause by clause.
  5. In the same change, retarget inbound links, delete the OpenSpec spec
     directory, and update the delegated list in the migration record.

  Once that list empties, decide the disposition of everything remaining under
  `openspec/`; it stays evidence throughout.

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

### Outliner

- **Tri-state checked rendering and toggle polarity.** Target behavior
  ([List types](spec/outliner/list-types.md#checked-state)): a note whose
  subtree is only partly checked displays as mixed, and toggling unchecks only
  when the whole target subtree is already checked. The implementation renders
  binary markers and computes toggle state from the targeted notes' own states
  (`CheckListPlugin.tsx`: single-note opposite, `targets.every` over range
  notes; asserted by `tests/unit/checklist-state.spec.ts`). Add mixed
  rendering and subtree-driven polarity together, updating the tests in the
  same change.

- **Menu toggle inside a structural selection.** Target behavior
  ([Menu](outliner/menu.md)): the note menu's toggle applies to the selected
  note range when the current note is inside it. The implementation always
  targets the menu's note (`noteItemKey` is resolved first in
  `CheckListPlugin.tsx`, asserted by `tests/unit/checklist-state.spec.ts`);
  adjust the resolution and tests.

- **Check-marker click vs selection.** Target behavior
  ([toggle targets](spec/outliner/list-types.md#toggling)): a marker
  click on a note inside a structural selection toggles the selected note
  range; the implementation always toggles only the clicked note (the marker
  click handler in `CheckListPlugin.tsx` sets state directly instead of
  dispatching `SET_NOTE_CHECKED_COMMAND`). Reroute it and cover with a test.
  The click's selection consequences stay with
  [Selection](outliner/selection.md).

### Agents

- **Review scope ownership.** Find a neutral owner for the
  [review scope definition](spec/skills/remdo-verify-change.md#scope), then update
  the verifier and convergence specifications to link to it.

- **Default verification scope.** Default to `working-tree` when the repository
  is dirty and `origin/main...HEAD` otherwise, clearly reporting the selected
  scope. Before implementing, confirm which component and contract level own
  this decision.

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

- **Empirical-check execution.** Define when and how implementation work runs a
  specification's empirical checks, records their evidence, and makes it
  available when deciding whether implementation is complete. Define how
  reviewers determine whether that evidence establishes conformance and when
  independent repetition is required. Use the
  [read-only runner](spec/agents/tools/read-only-runner.md#empirical-checks) as
  the first case, including its fixture-pass/real-repository-failure dogfood.
