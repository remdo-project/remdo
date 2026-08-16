# RemDo TODO

This ledger is RemDo's near-term backlog and single entry point for
[tracked follow-up](documentation.md#target-behavior). It also holds cross-cutting temporary state.

The closed [legacy backlog](legacy-backlog.md) holds earlier unresolved
entries. Continue checking its entries for duplicates and review suppression
until they are resolved or migrated.

## Tracked follow-up

Record code-local follow-up in [tracked comments](../CONTRIBUTING.md#code-comments), long-horizon
follow-up in the owning specification's [`Future`](documentation.md#future)
section, and other work intended to be done soon in this backlog. Together,
these locations form the tracking record; do not duplicate an item between them.

Run `pnpm run todo:list` when selecting maintenance work or auditing tracked
follow-up. It lists candidate `TODO` and `FIXME` occurrences in tracked
non-documentation files; inspect the results under the tracked-comment
convention above.

A reviewer suppresses a finding as already tracked only when the tracking
record covers the reported gap. Within this backlog, group related items under
short topic headings. Remove rejected or obsolete items and empty sections.

## Backlog

### Documentation

- **Remaining agent skill alignment.** Apply the adopted
  [specification/procedure boundary](documentation.md#agent-skill-boundary) to
  the remaining skills. Reconsider custom scripts and state machines that encode
  adaptive work without enough robustness to justify their maintenance. Prefer
  concise intent plus deterministic checks of stable repository invariants,
  then align each affected specification, procedure, implementation, and coverage.

- **Prepare-change lifecycle.** Reconsider its dialogue, specification,
  approval, and execution flow as a whole so it is simple, flexible, and clear.
  Cover both underdetermined changes that require developer decisions and
  already-determined changes—such as an explicit dependency refresh request
  after branch selection—that should not require redundant target confirmation.
  Define how accepted contracts, explicit instructions, branch and adopted-work
  decisions, and later evidence establish or reopen decisions, then align the
  specification and skill.

- **Condition ownership beyond capability calls.** Evaluate whether the
  [capability protocol](specs/agents/protocol.md) should generalize to other
  component boundaries. Define how independently invocable and
  invalidation-prone boundaries establish conditions without redundant checks.

- **Large-scope documentation alignment.** Evaluate the structured finding
  schema and parallel specialist-reviewer layout from the Upkeep skill
  (wei18/Upkeep) as a way to speed alignment over large scopes.

- **Skill-prose pressure testing.** Evaluate superpowers `writing-skills`
  adversarial subagent trials as an additional check for skill-file prose.

- **Markdown link-aware wrapping.** Define rendered-width paragraph reflow that
  preserves natural sentence and clause boundaries while ignoring hidden link
  and image destinations. Clarify the authoring rule and its agent discovery,
  determine which premature wraps can be rejected deterministically without
  requiring mechanical greedy wrapping, and align affected maintained prose.

### Editor

- **Editor module ownership.** Editor capabilities are split across `features/`,
  `plugins/`, `search/`, `links/`, `triggers/`, and `view/`, while `runtime/` and
  `outline/` import capability-specific modules. Establish a coherent folder
  taxonomy that makes ownership and shared foundations visible, migrate modules
  without changing behavior, and enforce the resulting dependency boundaries
  mechanically. Document only architectural boundaries that remain non-obvious
  from the source tree and enforcement.

### Dependencies

- **Dependabot pnpm 11 version updates.** When GitHub's [supported-ecosystems table](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories)
  lists pnpm v11, add `.github/dependabot.yml` for the root pnpm workspace,
  verify that its first update preserves workspace catalogs and passes a frozen
  lockfile install, and narrow or retire `remdo-deps-refresh` so dependency
  update discovery has one owner.

### Performance

- **Client performance contract.** Define measurable user-facing performance
  targets and the evidence used to assess them. Reassess the existing
  non-collaboration Vitest benchmark's workloads, operations, metric, and runner
  as part of that design, then establish a specification and align or replace
  the harness.

### Operations

- **Hosted production backups.** Define the scheduled backup and recovery
  workflow for hosted deployments, then align `docker/Dockerfile`,
  `docker/backup.sh`, `tools/snapshot/backup.ts`, and
  `tools/remote/make-backup.sh` with it.

### Outliner

- **Inline-selection Enter behavior.** Decide and specify what `Enter` does for
  a non-collapsed [inline text selection](specs/outliner/selection.md#selection-states)
  in [Insertion](specs/outliner/insertion.md), then align implementation and automated coverage.

- **Current-location presentation ownership.** Before implementing the
  [view header](specs/outliner/view-header.md) alongside [zoom breadcrumbs](specs/outliner/zoom.md#breadcrumbs), reconsider its name
  and scope, including whether "location header" better identifies it and
  whether editable current-location presentation remains separate from
  ancestor breadcrumb navigation. Update both owners and their inbound links
  together with the decision. Coordinate with the [legacy view-header follow-ups](legacy-backlog.md#home-and-view-header-follow-ups).

- **Body-local command targets.** Target behavior ([Body](specs/outliner/body.md#selection-and-structural-targeting), [Indentation](specs/outliner/indentation.md#target-resolution), [Reordering](specs/outliner/reordering.md#target-resolution),
  [List types](specs/outliner/list-types.md#toggling), [Mobile toolbar](specs/outliner/mobile-toolbar.md#actions), and [Menu](specs/outliner/menu.md#behavior)): a caret or inline text selection
  inside a body targets its owning editor note for commands that act on a note.
  The structural resolver handles a collapsed body caret, but a body-local
  inline selection produces no range, leaving indentation, reordering, and
  toolbar deletion as no-ops. `$resolveToggleTargets` and
  `$resolveFocusNoteKey` use body-rejecting content resolution, leaving
  checked-state toggles, focus-note toolbar actions, and the double-Shift menu
  as no-ops. Align shared body-to-owner resolution and add focused coverage for
  each affected command path.

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

- **Check-marker click vs selection.** Target behavior ([toggle targets](specs/outliner/list-types.md#toggling)): a marker
  click on a note inside a structural selection toggles the selected note
  range; the implementation always toggles only the clicked note (the marker
  click handler in `CheckListPlugin.tsx` sets state directly instead of
  dispatching `SET_NOTE_CHECKED_COMMAND`). Reroute it and cover with a test.
  The click's selection consequences stay with [Selection](specs/outliner/selection.md).

- **Replace the date-picker calendar widget.** The Mantine `DatePicker` in
  `DatePickerPopover.tsx` does not move keyboard focus across month boundaries
  or implement the calendar's complete [keyboard contract](specs/outliner/dates.md#core-behavior). Its two
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

- **Capability protocol adoption.** Identify agent capabilities used as
  composable participants, give their specifications explicit `Call` and
  `Result` sections conforming to the [capability protocol](specs/agents/protocol.md), then align their execution
  procedures. Do not invent calls for developer-facing entry points.

- **Configured-upstream synchronization.** Design a capability separate from
  [`remdo-merge-main`](specs/agents/skills/remdo-merge-main.md) that synchronizes
  the current branch with its configured upstream. Classify fast-forward,
  local-ahead, ordinary divergence, and likely rewritten upstream history before
  choosing merge or explicitly authorized rebase, with conflict and recovery
  behavior defined for each path. Keep `origin/main` integration owned by `remdo-merge-main`.

- **Prepare-change implementation-gap tracking.** Update
  [`remdo-prepare-change`](specs/agents/skills/remdo-prepare-change.md) so after
  adding or changing a durable specification, it determines whether the
  implementation conforms. Before any commit that would leave the specification
  ahead of implementation, create or update a precise tracked follow-up for the
  remaining implementation and remove it when implementation aligns. Do not
  create a tracker when the committed state is already coherent.

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](dev/testing.md#empirical-checks).

- **Repository annotation discovery.** Define a closed registry for searchable,
  repository-owned annotations, initially verification classifications and
  code-local `TODO`/`FIXME`, with each family owning its scope, trigger, required
  response, discovery, and lifecycle. Evaluate namespaced Markdown syntax and a
  simple typed discovery command that preserves `todo:list`, then make applicable
  agent review workflows invoke the relevant view. Exclude external-tool
  directives, and do not treat discovery as proof that an obligation is satisfied.
  Examples: Deterministic check, Empirical check, Deterministic/agentic?
  implementation (for skills' specs)

- **Skill-spec ownership boundaries.** Verify ownership between agent skill
  specifications, starting with [`remdo-prepare-change`](specs/agents/skills/remdo-prepare-change.md), and
  repository-wide or contributor contracts such as
  [Contributing](../CONTRIBUTING.md). Keep capability-specific behavior with
  its skill and shared policy with the broader owner; update links and remove
  restatements in the same change.

- **Structured reviewer results.** Evaluate provider-supported structured
  findings, such as JSON Schema output, without weakening native review or
  evidence. If viable, define verifier normalization into the shared [agent result](specs/agents/protocol.md#results).

- **Post-skill retrospectives.** Make an on-demand retrospective available
  after skill runs, using saved session logs to explain elapsed time, repeated
  or costly work, and concrete lessons. Add dedicated orchestration or
  instrumentation only if real retrospectives show that the existing evidence
  is insufficient.

### Tooling

- **Upstream ast-grep project-config validation.** Contribute upstream support
  for rejecting unknown project-config keys or shipping version-matched schemas
  with `@ast-grep/cli`, then replace the repository-owned config validator with
  that upstream mechanism.
