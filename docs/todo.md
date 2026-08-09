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

- **Specification vocabulary review.** Make future specification-authoring and
  review workflows apply the [ownership](documentation.md#ownership) and [minimality](documentation.md#minimality) rules to every domain- or
  component-specific term, including consistent actor and component identity.

- **Agent skill specifications.** Establish accepted-behavior owners under
  `docs/specs/agents/skills/` for `playground` and `remdo-simplify`, then align
  their execution procedures and links.

- **Agent repository-authority declarations.** Define compact authority modes
  in [Agent instructions](specs/agents/instructions.md#repository-authority) and
  replace repeated per-skill permission prose with linked declarations.

- **Condition ownership beyond capability calls.** Evaluate whether the
  [capability protocol](specs/agents/protocol.md) should generalize to other
  component boundaries. Define how independently invocable and
  invalidation-prone boundaries establish conditions without redundant checks.

- **Large-scope documentation alignment.** Evaluate the structured finding
  schema and parallel specialist-reviewer layout from the Upkeep skill
  (wei18/Upkeep) as a way to speed alignment over large scopes.

- **Skill-prose pressure testing.** Evaluate superpowers `writing-skills`
  adversarial subagent trials as an additional check for skill-file prose.

### Editor

- **Editor module ownership.** Editor capabilities are split across `features/`,
  `plugins/`, `search/`, `links/`, `triggers/`, and `view/`, while `runtime/` and
  `outline/` import capability-specific modules. Establish a coherent folder
  taxonomy that makes ownership and shared foundations visible, migrate modules
  without changing behavior, and enforce the resulting dependency boundaries
  mechanically. Document only architectural boundaries that remain non-obvious
  from the source tree and enforcement.

### Testing

- **Verification ownership and lifecycle.** Assign repository checks, browser
  and Docker E2E, cleanup and policy audits, dependency-install consistency,
  and local versus CI evidence to clear durable and executable owners. Define
  when each runs and which mutations invalidate its result, then revisit
  [dependency-refresh verification](specs/agents/skills/remdo-deps-refresh.md#verification)
  and other capability specifications so they reference those owners and run
  each check at the correct lifecycle point.

- **Docker E2E diagnostic runtime.** Reconsider the removal-on-exit lifecycle in
  `docs/specs/testing/test-harness.md`. Evaluate retaining runtime data and
  captured container logs in a stable, permission-restricted location until the
  next invocation. If adopted, replace that state only after startup preflight,
  preserve container-assisted cleanup for root-owned files, keep authentication
  and test-secret data local, and update the specification and implementation together.

- **Contributor testing policy.** Move contributor-wide test-quality policy
  from `AGENTS.md` to `docs/dev/testing.md`: observable behavior or stable
  contracts, credible regressions, automated test-level selection, empirical
  exceptions, and review coverage. Keep agent execution procedures and check
  commands in `AGENTS.md`, then update their inbound links.

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
  `Result` sections conforming to the
  [capability protocol](specs/agents/protocol.md), then align their execution
  procedures. Do not invent calls for developer-facing entry points.

- **Prepare-change implementation-gap tracking.** Update
  [`remdo-prepare-change`](specs/agents/skills/remdo-prepare-change.md) so after
  adding or changing a durable specification, it determines whether the
  implementation conforms. Before any commit that would leave the specification
  ahead of implementation, create or update a precise tracked follow-up for the
  remaining implementation and remove it when implementation aligns. Do not
  create a tracker when the committed state is already coherent.

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](documentation.md#empirical-checks).

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

- **Standard workspace bootstrap.** Retire `pnpm run dev:init` and
  `tools/dev-init.sh`. Document `pnpm install --frozen-lockfile` for local
  setup, let E2E workflows invoke `pnpm exec playwright install chromium`
  after shared workspace setup, and remove obsolete references.

- **Upstream-owned launcher reassessment.** Reassess whether Playwright can
  replace `tools/e2e/docker-source-server.ts`, and whether Vite or direct tool
  commands can retire the remaining dev-boundary, collaboration-server, and
  single-command package wrappers.

- **Upstream ast-grep project-config validation.** Contribute upstream support
  for rejecting unknown project-config keys or shipping version-matched schemas
  with `@ast-grep/cli`, then replace the repository-owned config validator with
  that upstream mechanism.
