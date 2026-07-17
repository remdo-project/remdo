## ADDED Requirements

### Requirement: Verification resolves one review scope

The request MUST select exactly one scope: an explicit Git range resolved to
commit IDs with a clean working tree, or the current uncommitted change reviewed
in place. Uncommitted scope includes staged, unstaged, and untracked files not
ignored by Git.

#### Scenario: Git-range scope conflicts with uncommitted changes

- **WHEN** Git-range scope is requested while uncommitted changes exist
- **THEN** the verifier reports a scope conflict and stops before checks

### Requirement: Verification resolves the review mode

Every request MUST select specification or implementation readiness.
Implementation readiness MUST also include the approval commit.

#### Scenario: Required input is missing

- **WHEN** a request omits its mode or required approval commit
- **THEN** the verifier reports the missing input and stops before checks

### Requirement: Reviewers evaluate readiness from repository intent

Each reviewer MUST derive intent from the change and repository, report sources
or ambiguity, cite evidence, and refrain from file edits and automated checks.

Specification mode MUST assess whether the proposed contract is ready for
approval without requiring implementation. Implementation mode MUST assess
whether the implementation and supporting evidence satisfy the approved
contract in both directions.

#### Scenario: A repository rule conflicts with a generic preference

- **WHEN** a repository rule conflicts with a generic review preference
- **THEN** the reviewer follows the repository rule

### Requirement: Reviewer adapters prove native review activation

Each adapter MUST use its provider's native review mode and accept a result only
when provider-originated execution evidence confirms activation. Process success
or review-like model output MUST NOT count as confirmation. Missing confirmation
MUST make that review incomplete or failed, without a generic-agent fallback.

#### Scenario: Review-like output lacks activation evidence

- **WHEN** a provider process returns review-like output without confirmed native
  review activation
- **THEN** the adapter reports the review incomplete or failed and records the
  missing evidence as a degradation

### Requirement: Review outcomes preserve findings and degradation

The result MUST be one of: clean, findings, or incomplete or failed. It MUST
preserve native-review activation evidence, intent sources, finding evidence,
rejected findings, and every degradation reason.

#### Scenario: A reviewer returns invalid output

- **WHEN** a reviewer returns invalid output
- **THEN** its review is incomplete or failed with a degradation reason

### Requirement: The verifier attempts every reviewer

The verifier MUST attempt every planned reviewer independently and wait for
each to exit or for caller cancellation. One reviewer failure MUST NOT abort
another. The verifier MUST impose no timeout or inactivity deadline;
deterministic checks retain repository-defined duration guards.

#### Scenario: One reviewer is unavailable

- **WHEN** one reviewer cannot start while another completes
- **THEN** the verifier preserves the completed evidence and reports the
  unavailable reviewer and reason

### Requirement: Accepted fixes restart verification

The verifier MUST run applicable checks, then dispatch all planned reviewers
concurrently. Checks and reviewers MUST be read-only with respect to the
candidate. The coordinator MUST wait for them to finish before editing it.

The loop converges when checks pass and no accepted findings remain. A
degradation MUST leave available evidence intact and make the result incomplete
or failed.

#### Scenario: An accepted finding changes the candidate

- **WHEN** the coordinator fixes an accepted finding
- **THEN** the verifier reruns applicable checks and every planned reviewer over
  the resulting candidate
