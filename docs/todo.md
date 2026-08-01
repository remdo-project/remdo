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

- **Current-location presentation ownership.** Before implementing the
  [view header](specs/outliner/view-header.md) alongside
  [zoom breadcrumbs](specs/outliner/zoom.md#breadcrumbs), reconsider its name
  and scope, including whether "location header" better identifies it and
  whether editable current-location presentation remains separate from
  ancestor breadcrumb navigation. Update both owners and their inbound links
  together with the decision. Coordinate with the
  [legacy view-header follow-ups](legacy-backlog.md#home-and-view-header-follow-ups).

- **Body-local structural-command target.** Target behavior
  ([Body](specs/outliner/body.md#selection-and-structural-targeting),
  [Indentation](specs/outliner/indentation.md#keyboard-indentation),
  [Reordering](specs/outliner/reordering.md#keyboard-reordering)): a caret or
  inline text selection targets the editor note owning its region. The
  implementation resolves a body caret through
  `$resolveStructuralRangeFromLexicalSelection`'s collapsed fallback, but
  `$getContiguousSelectionHeads` returns no heads for a body-local inline
  selection, so indentation and reordering are no-ops. Align the resolver and
  add focused coverage for both commands.

- **Tri-state checked rendering and toggle polarity.** Target behavior
  ([List types](specs/outliner/list-types.md#checked-state)): a note whose
  subtree is only partly checked displays as mixed, and toggling unchecks only
  when the whole target subtree is already checked. The implementation renders
  binary markers and computes toggle state from the targeted notes' own states
  (`CheckListPlugin.tsx`: single-note opposite, `targets.every` over range
  notes; asserted by `tests/unit/checklist-state.spec.ts`). Add mixed
  rendering and subtree-driven polarity together, updating the tests in the
  same change.

- **Menu toggle inside a structural selection.** Target behavior
  ([Menu](specs/outliner/menu.md)): the note menu's toggle applies to the selected
  note range when the current note is inside it. The implementation always
  targets the menu's note (`noteItemKey` is resolved first in
  `CheckListPlugin.tsx`, asserted by `tests/unit/checklist-state.spec.ts`);
  adjust the resolution and tests.

- **Check-marker click vs selection.** Target behavior
  ([toggle targets](specs/outliner/list-types.md#toggling)): a marker
  click on a note inside a structural selection toggles the selected note
  range; the implementation always toggles only the clicked note (the marker
  click handler in `CheckListPlugin.tsx` sets state directly instead of
  dispatching `SET_NOTE_CHECKED_COMMAND`). Reroute it and cover with a test.
  The click's selection consequences stay with
  [Selection](specs/outliner/selection.md).

- **Replace the date-picker calendar widget.** The Mantine `DatePicker` in
  `DatePickerPopover.tsx` does not move keyboard focus across month boundaries
  or implement the calendar's complete
  [keyboard contract](specs/outliner/dates.md#core-behavior). Its two
  keyboard-and-commit E2E cases in `tests/e2e/editor/date-picker.spec.ts` are
  skipped until a replacement restores that coverage. Research and compare
  current maintained options rather than selecting from the preliminary spike:
  React DayPicker is the closest complete widget and documents the required
  APG keyboard behavior; React Aria Calendar provides a stronger accessibility
  and internationalization foundation but requires more composition; a future
  Mantine release or upstream fix may preserve the current integration. Compare
  cross-month focus, the complete key set, ISO-date and time-zone handling,
  accessibility, styling and bundle cost, and maintenance burden. Implement the
  selected replacement and re-enable both tests.

### Agents

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](documentation.md#empirical-checks).

- **Agent specification structure.** Move the
  [`remdo-verify-change`](specs/skills/remdo-verify-change.md) specification
  under `docs/specs/agents/skills/` and update all inbound links in the same
  change.

- **Development change workflow design.** Before implementing the initial
  [workflow contract](specs/agents/development-change-workflow.md), validate its
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
