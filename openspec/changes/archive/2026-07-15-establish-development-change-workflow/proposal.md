## Why

RemDo's durable-spec boundary currently excludes development and operational
behavior even when that behavior needs the same stable, reviewable contract as
product features. Establishing one project-wide specification flow now gives
future workflow customizations an authoritative owner that remains independent
of the OpenSpec version implementing them.

## What Changes

- Broaden the durable-spec boundary from product behavior to any maintained
  RemDo behavior that warrants a specification.
- Introduce a generic development change-workflow capability implemented as a
  RemDo-owned layer over generated OpenSpec workflows.
- Add the first workflow rule: archive-only OpenSpec finalization is proposed
  and executed atomically with its corresponding local commit.
- Keep generated OpenSpec skills and commands upstream-owned and replaceable.

## Capabilities

### New Capabilities

- `development-change-workflow`: Agent-assisted development change lifecycle,
  including OpenSpec transitions, automatic local actions, responsibility
  boundaries, and failure handling.

### Modified Capabilities

None.

## Impact

- Documentation ownership in `docs/documentation.md` and OpenSpec project
  instructions in `openspec/config.yaml`.
- A shared RemDo workflow skill and its agent adapters.
- The existing archive-only commit policy in `AGENTS.md`.
- Future OpenSpec dependency refreshes, which may replace local implementation
  without changing the RemDo-owned workflow contract.
