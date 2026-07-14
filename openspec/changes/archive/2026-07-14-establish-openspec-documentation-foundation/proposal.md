## Why

RemDo needs a stable boundary for gradually moving durable product behavior from
`docs/` into OpenSpec without creating duplicate sources of truth or mixing
long-lived specifications with temporary migration work.

## What Changes

- Define `openspec/specs/` as the home for accepted durable product behavior and
  `openspec/changes/` as the home for proposed, not-yet-incorporated behavior,
  design, and implementation tasks.
- Keep project principles, contributor policy, development policy, and runbooks
  in `docs/`.
- Carry RemDo's existing scope-first, minimal, observable-contract writing rules
  into OpenSpec configuration and documentation workflow guidance.
- Add a short, explicitly temporary migration tracker with the current phase,
  completed capabilities, and one next capability.
- Establish `list-types` as the first capability migration after this foundation.

## Capabilities

### New Capabilities

- `documentation-foundation`: Change-local requirements for documentation
  authority, OpenSpec writing rules, and migration tracking. This is a temporary
  planning capability for a documentation-only change and will be archived with
  `--skip-specs`; it does not become a durable product capability.

### Modified Capabilities

None. No existing product requirement changes.

## Impact

- Documentation workflow guidance in `AGENTS.md`, `docs/documentation.md`, and
  `docs/contributing.md`.
- OpenSpec project configuration in `openspec/config.yaml`.
- A temporary migration tracker under `openspec/`.
- No application code, product behavior, runtime dependencies, or existing
  product specifications.
