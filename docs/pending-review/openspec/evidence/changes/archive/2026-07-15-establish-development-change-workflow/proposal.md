## Why

RemDo's durable-spec boundary currently excludes development and operational
behavior even when that behavior needs the same stable, reviewable contract as
product features. Broadening that boundary gives future workflow changes an
authoritative owner independent of the OpenSpec version implementing them.

## What Changes

- Broaden the durable-spec boundary from product behavior to any maintained
  RemDo behavior that warrants a specification.
- Introduce a generic development change-workflow capability as the durable
  owner for future accepted lifecycle requirements.
- Remove the existing archive-only commit exception until finalization is
  specified as part of the complete workflow.
- Keep generated OpenSpec skills and commands upstream-owned and replaceable.

## Capabilities

### New Capabilities

- `development-change-workflow`: Agent-assisted development change lifecycle,
  with requirements that remain stable across OpenSpec versions.

### Modified Capabilities

None.

## Impact

- Documentation ownership in `docs/documentation.md` and OpenSpec project
  instructions in `openspec/config.yaml`.
- Removal of the archive-only commit policy in `AGENTS.md`.
- Future workflow implementation and OpenSpec dependency refreshes.
