---
name: remdo-change-flow
description: >-
  Use for RemDo-specific orchestration around the OpenSpec lifecycle. The
  current customized action is archive-only finalization: once --skip-specs has
  been chosen, propose and execute the archive plus its local commit atomically
  while delegating standard OpenSpec mechanics.
---

# RemDo Change Flow

## Intent

Implement RemDo's durable
[`development-change-workflow`](../../../openspec/specs/development-change-workflow/spec.md)
as a thin conductor over the generated OpenSpec workflows and the project-local
`./tools/openspec` CLI. Generated OpenSpec skills and commands are replaceable
upstream assets; do not modify or copy their procedures here.

Standard OpenSpec actions with no RemDo-specific behavior stay with the
corresponding generated workflow. Apply this conductor whenever a lifecycle
action has a RemDo extension. Its current extension is archive-only
finalization.

## Archive-only finalization

Use the runtime's generated `openspec-archive-change` workflow for change
resolution and completion checks. Treat `--skip-specs` as an already-made input
and do not repeat the spec-sync decision. When archival is next, propose the
archive and its archive-only local commit as one action.

Once the user authorizes that combined action:

1. Confirm no pre-existing unrelated change overlaps the active change path or
   its date-prefixed archive destination.
2. Archive through `./tools/openspec archive <change> --skip-specs --yes` from
   the repository root.
3. Run `./tools/openspec validate --all --strict`.
4. Stage only the active change path and its archive destination, so Git records
   the move without absorbing other work.
5. Commit the archive move immediately with a concise archive message.

If path isolation is unsafe or strict validation fails, do not stage or commit
the archive. Leave the resulting working-tree state visible and report the
blocking condition. Never push as part of this action.

## Permissions

Invoking this skill for archive-only finalization, or explicitly asking to
archive an OpenSpec change with `--skip-specs`, authorizes exactly one local
archive-only commit after the path-isolation and validation gates pass. It does
not authorize other commits, pushes, pulls, or unrelated index changes.

## Growth boundary

Add future RemDo workflow behavior only after its requirement is accepted in
the durable capability. Before implementing a new extension, check the pinned
OpenSpec workflows for an existing primitive and delegate it wherever it
satisfies the accepted requirement. Add each automatic action with explicit
triggers, preconditions, allowed mutations, validation, and failure behavior;
do not invent a generic automation framework before repeated actions establish
one.

## References

- Generated archive assessment and mechanics: `openspec-archive-change` skill.
- Project-local OpenSpec command translation and global Git/index safety:
  [`AGENTS.md`](../../../AGENTS.md).
