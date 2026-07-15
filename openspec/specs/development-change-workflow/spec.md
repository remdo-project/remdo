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
