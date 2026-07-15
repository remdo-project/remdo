## ADDED Requirements

### Requirement: A branch has one active development change

A branch MUST NOT contain more than one active OpenSpec change.

#### Scenario: Another change is already active

- **WHEN** an agent is asked to start a change on a branch that already has an
  active change
- **THEN** the new change requires a different branch

### Requirement: The main spec is the contract review surface

Before implementation, the workflow MUST synchronize the change delta into its
main specs and present those specs with the active tasks for explicit approval.

#### Scenario: A change is ready for specification

- **WHEN** exploration has established requirements ready for review
- **THEN** the agent synchronizes the delta, presents the main specs and tasks,
  and leaves implementation unchanged

### Requirement: Active tasks disclose implementation gaps

While a branch's main specs contain accepted target behavior that its
implementation does not yet satisfy, incomplete tasks in the branch's sole
active change MUST identify the outstanding work.

#### Scenario: Accepted target behavior is ahead of code

- **WHEN** a reader evaluates whether the branch implements an accepted main
  spec
- **THEN** the active change tasks identify every known outstanding obligation

### Requirement: Approved specs remain stable during implementation

Implementation MUST begin only after explicit approval of the main specs and
active tasks. Approved requirements MUST remain unchanged during implementation;
a required revision returns the workflow to specification and renewed approval.

#### Scenario: Implementation confirms the approved contract

- **WHEN** implementation proceeds without invalidating an approved requirement
- **THEN** the agent changes code, tests, and task completion without changing
  the approved requirements

#### Scenario: Implementation invalidates the approved contract

- **WHEN** implementation reveals that an approved requirement must change
- **THEN** the agent pauses implementation and updates the delta, main spec, and
  active tasks for renewed approval

### Requirement: Finalization proves implementation convergence

Before archival, the workflow MUST verify that the implementation and tests
satisfy the approved main specs, every task is complete, the main specs match
the delta, and the approved requirements have not changed since their latest
approval. It MUST skip spec synchronization during archival.

#### Scenario: A change is ready to archive

- **WHEN** implementation and review are complete
- **THEN** the agent verifies convergence and archives with spec synchronization
  skipped
