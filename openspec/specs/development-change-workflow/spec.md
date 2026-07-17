# Development Change Workflow Specification

## Purpose

Define durable requirements for RemDo's agent-assisted development change
lifecycle independently of the OpenSpec version used to implement it.

## Requirements

### Requirement: RemDo workflow requirements survive OpenSpec updates

RemDo-specific development workflow behavior MUST remain authoritative outside
generated OpenSpec skills and commands. Updating or replacing those generated
assets MUST NOT redefine the accepted RemDo workflow requirements.

#### Scenario: OpenSpec adds overlapping workflow behavior

- **WHEN** an OpenSpec dependency update adds behavior that overlaps a RemDo
  workflow requirement
- **THEN** the RemDo implementation may adopt or adapt that behavior only while
  continuing to satisfy the accepted requirement

### Requirement: A branch has one active development change

A branch MUST NOT contain more than one active OpenSpec change.

#### Scenario: Another change is already active

- **WHEN** an agent is asked to start a change on a branch that already has an
  active change
- **THEN** the new change requires a different branch

### Requirement: One blessed workflow owns spec-bearing changes

`remdo-change-flow` MUST be the sole blessed end-to-end lifecycle for a
spec-bearing development change. Supporting skills MAY implement a phase but
MUST NOT define or bypass a parallel lifecycle.

#### Scenario: A supporting skill completes readiness verification

- **WHEN** `remdo-verify-change` completes a readiness review
- **THEN** control and its result return to `remdo-change-flow` for the remaining
  lifecycle

### Requirement: The main spec is the contract review surface

Before implementation, the workflow MUST synchronize the change delta into its
main specs, reconcile accepted architectural decisions into applicable
permanent capability designs, and run specification-readiness review over the
current planning state. It MUST present the main specs and permanent designs
with the active tasks and readiness result for one explicit approval. The main
specs remain the behavioral contract, while permanent designs record the
approved architecture.

#### Scenario: A change is ready for specification

- **WHEN** requirements and design decisions are ready for review
- **THEN** the workflow presents the reconciled approval surface without
  changing implementation

### Requirement: Active tasks disclose implementation gaps

Incomplete tasks in the branch's sole active change MUST identify every known
implementation gap against accepted main specs or permanent capability
designs.

#### Scenario: Accepted intent is ahead of code

- **WHEN** accepted behavior or architecture is not yet implemented
- **THEN** its active-change task remains incomplete

### Requirement: Approved specs remain stable during implementation

Implementation MUST begin only after explicit approval of the main specs,
permanent capability designs, and active tasks at a commit boundary. Approved
requirements and designs MUST remain unchanged during implementation; a
required revision returns the workflow to specification-readiness review and
renewed approval.

#### Scenario: Implementation confirms the approved contract

- **WHEN** implementation does not require an intent revision
- **THEN** code, tests, and task completion may change while approved intent does
  not

#### Scenario: Implementation invalidates the approved contract

- **WHEN** implementation reveals that an approved requirement or design must
  change
- **THEN** the agent pauses implementation and returns the reconciled planning
  state through specification-readiness review and renewed approval

### Requirement: The lifecycle supplies readiness context

The workflow MUST supply `remdo-verify-change` with the selected mode and
resolved scope, plus the approved baseline for implementation readiness. It
MUST preserve findings, intent sources, and reviewer degradations in the result.

#### Scenario: Proposed intent is ready for approval

- **WHEN** planning artifacts and their permanent owners have been reconciled
- **THEN** the workflow requests specification-readiness review over that
  current planning state before presenting the contract for approval

#### Scenario: Implementation is ready for final review

- **WHEN** implementation tasks are complete
- **THEN** the workflow requests implementation-readiness verification against
  the immutable approval baseline before presenting the implementation

### Requirement: The user receives final review evidence

After implementation-readiness verification completes without accepted
findings, the workflow MUST present the user with the verified implementation
scope, contract-compliance outcome, reviewer activity and degradations, applied
fixes, rejected findings, trade-offs, untested behavior, and final check
results, then pause until the user completes review by authorizing the
implementation commit.

#### Scenario: The user requests a change

- **WHEN** the user requests an implementation edit after reviewing the evidence
- **THEN** the agent applies the edit and presents a newly verified state

### Requirement: Finalization proves implementation convergence

Before archival, the workflow MUST verify that implementation-readiness review
covers the current implementation against the approved baseline, every task is
complete, the main specs match the delta, and accepted change-design decisions
are reflected in their permanent owners, and the verified implementation is
committed. Authorization of the implementation commit MUST NOT authorize
archival.

#### Scenario: A change is ready to archive

- **WHEN** implementation-readiness verification and user review are complete
  and the verified implementation is committed
- **THEN** the workflow obtains separate archival authorization, verifies
  convergence, and archives with spec synchronization skipped
