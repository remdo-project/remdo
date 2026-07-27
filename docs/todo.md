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

- **Normative prose migration.** Remove RFC-style uppercase requirement
  keywords from current contract owners and agent skills, preserving
  distinctions expressed by `SHOULD` and `MAY` in ordinary prose. Leave retired
  and archived evidence unchanged.

- **Specification vocabulary review.** Make future specification-authoring and
  review workflows apply the [ownership](documentation.md#ownership) and
  [minimality](documentation.md#minimality) rules to every domain- or
  component-specific term, including consistent actor and component identity.

### Outliner

- **Body-local note-target ownership.** Move the rule that a body-local
  selection supplies its owning editor note to [Body](outliner/body.md), then
  align [Selection](outliner/selection.md), indentation, reordering,
  checked-state targeting, toolbar actions, and other target-note-range
  consumers that should share it. Remove action-local restatements only when
  the shared owner exists.

- **Body-local structural-command target.** Target behavior
  ([Indentation](spec/outliner/indentation.md#keyboard-indentation),
  [Reordering](spec/outliner/reordering.md#keyboard-reordering)): a caret or
  inline text selection targets the editor note owning its region. The
  implementation resolves a body caret through
  `$resolveStructuralRangeFromLexicalSelection`'s collapsed fallback, but
  `$getContiguousSelectionHeads` returns no heads for a body-local inline
  selection, so indentation and reordering are no-ops. Align the resolver and
  add focused coverage for both commands.

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

- **`remdo-merge-main` implementation.** Implement the
  [merge-main contract](spec/skills/remdo-merge-main.md) with a deterministic
  runner, then retire `remdo-sync`.

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](documentation.md#empirical-checks).

- **Agent specification structure.** Move the
  [`remdo-verify-change`](spec/skills/remdo-verify-change.md) specification
  under `docs/spec/agents/skills/` and update all inbound links in the same
  change.

- **Development change workflow design.** Before implementing the initial
  [workflow contract](spec/agents/development-change-workflow.md), validate its
  phase boundaries through real changes and revise them when evidence requires.
  Define the active change record and approval baseline, how nested component
  results reach the user, which component owns deterministic checks, where fresh
  sessions begin, and whether recurring ambiguity justifies separate
  specification- and implementation-readiness modes.

- **Post-skill retrospectives.** Make an on-demand retrospective available
  after skill runs, using saved session logs to explain elapsed time, repeated
  or costly work, and concrete lessons. Add dedicated orchestration or
  instrumentation only if real retrospectives show that the existing evidence
  is insufficient.
