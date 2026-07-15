## Context

OpenSpec normally keeps proposed requirements in a change-local delta until
archival synchronizes them into the main spec. That preserves a clean split
between current and proposed behavior, but makes RemDo contributors review the
same contract twice and hides removals or interactions that are clearest in the
durable spec's full context.

RemDo branches already isolate unfinished work. The workflow can therefore let
the main spec on an active branch describe the accepted target while the active
change records the remaining gap. Generated OpenSpec assets remain an upstream
dependency and cannot own this RemDo-specific lifecycle.

## Goals / Non-Goals

**Goals:**

- Make the main spec the contract review surface before implementation.
- Preserve standard OpenSpec deltas, validation, and archives.
- Keep an honest, discoverable record when the branch's accepted spec is ahead
  of its implementation.
- Give implementation a stable approved contract and an explicit revision
  loop.

**Non-Goals:**

- Modify generated OpenSpec skills, commands, schemas, or dependency code.
- Support multiple active changes on one branch.
- Automate commits or remote Git operations.

## Decisions

### Compose standard OpenSpec primitives in a RemDo-owned conductor

The conductor uses the existing propose, spec synchronization, apply, verify,
and archive operations, adding RemDo's ordering and gates around them. Before
adding custom behavior, its implementation checks whether the pinned OpenSpec
version already provides a suitable primitive.

This keeps the customization replaceable as OpenSpec evolves. A custom schema
would encode the same lifecycle deeper inside the dependency, while editing
generated commands would be overwritten by dependency updates.

The general `remdo-change-flow` conductor owns the lifecycle for spec-bearing
changes. The existing `remdo-feature-flow` keeps its feature-specific autonomy
and quality loop, but delegates its specification lifecycle to the general
conductor instead of maintaining a competing docs-first contract.

### Materialize the delta before contract review

The conductor first creates a standard delta, then synchronizes that delta into
the main spec before presenting the contract for review. The main spec is the
primary review surface; the delta remains equivalent transport and archive
history rather than a second independently reviewed contract.

The same review includes the active task list, whose incomplete tasks identify
the implementation gap. Approval is recorded at a commit boundary after the
user explicitly accepts both surfaces. Existing repository commit permissions
still apply; the conductor does not infer authorization to commit.

Keeping proposed behavior only in the delta would retain the duplicate review.
Dropping the delta entirely would fight OpenSpec's schema, validation, and
archive model.

### Freeze the approved contract during implementation

After approval, implementation changes code, tests, and task completion only.
If implementation reveals that the contract must change, work returns to the
spec phase: the delta, main spec, and gap record are updated together and the
new baseline requires explicit approval before implementation resumes.

This gives code review a stable contract. Allowing opportunistic spec edits
during implementation would make it unclear whether code was checked against
the contract the user approved.

### Allow one active change per branch

The sole active change is the unambiguous temporary owner of gaps between the
branch's main specs and implementation. Independent work uses another branch or
worktree.

Supporting concurrent changes would require a merged gap ledger and conflict
rules for overlapping main specs. That complexity is deferred until RemDo has
a concrete need for it.

### Archive without reapplying the delta

Finalization verifies that the approved main spec is unchanged, all tasks are
complete, and code and tests satisfy it. The conductor then archives the change
without synchronizing specs again because the delta was materialized before
implementation.

## Risks / Trade-offs

- **A branch's main spec can temporarily be ahead of code.** The single active
  change and its incomplete tasks make that gap explicit; unfinished branches
  are not merged.
- **The delta and main spec can drift.** The conductor checks their equivalence
  at approval and finalization, and revision updates them together.
- **OpenSpec updates can overlap the conductor.** RemDo requirements stay in the
  main workflow spec, and the conductor prefers suitable upstream primitives
  when available.
