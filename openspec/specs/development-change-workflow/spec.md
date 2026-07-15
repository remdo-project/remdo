# Development Change Workflow Specification

## Purpose

Define RemDo's agent-assisted development change lifecycle, including OpenSpec
transitions, automatic local actions, responsibility boundaries, and failure
handling. Generated OpenSpec behavior is outside this capability except where
RemDo places requirements on its use.

## Requirements

### Requirement: Durable requirements use one specification flow

Accepted durable requirements for RemDo-maintained product, development, and
operational behavior MUST use main OpenSpec specs as their authoritative source.
A change to those requirements MUST use an OpenSpec change; implementation work
that preserves the accepted requirements need not create a durable spec update.

#### Scenario: Development behavior warrants a durable contract

- **WHEN** a proposed development workflow behavior needs a stable contract
  across implementations or dependency versions
- **THEN** its requirements are proposed and incorporated through the same
  OpenSpec lifecycle as product requirements

#### Scenario: Implementation changes without changing the contract

- **WHEN** code, configuration, tests, or agent instructions change while
  preserving accepted requirements
- **THEN** the work may proceed without changing a main spec

### Requirement: RemDo workflow requirements survive OpenSpec updates

RemDo-specific development workflow behavior MUST remain authoritative outside
generated OpenSpec skills and commands. Updating or replacing those generated
assets MUST NOT redefine the accepted RemDo workflow requirements.

#### Scenario: OpenSpec adds overlapping workflow behavior

- **WHEN** an OpenSpec dependency update adds behavior that overlaps a RemDo
  workflow requirement
- **THEN** the RemDo implementation may adopt or adapt that behavior only while
  continuing to satisfy the accepted requirement

### Requirement: Archive-only finalization is atomic

When a completed OpenSpec change is ready to archive and `--skip-specs` has
already been chosen, the agent MUST treat archival and its archive-only local
commit as one action. This rule MUST NOT imply that other archives skip spec
updates.

#### Scenario: Agent recommends archive-only finalization

- **WHEN** `--skip-specs` has already been chosen and archival is the next
  workflow step
- **THEN** it proposes the archive and corresponding archive-only commit
  together

#### Scenario: User authorizes archive-only finalization

- **WHEN** the user authorizes the proposed `--skip-specs` archive action
- **THEN** the agent archives the change, runs strict OpenSpec validation,
  stages only the archive move, and commits it without another authorization
  round

#### Scenario: Archive-only finalization cannot complete safely

- **WHEN** validation fails or unrelated changes overlap the archive paths
- **THEN** the agent leaves the archive uncommitted and reports the blocking
  condition
