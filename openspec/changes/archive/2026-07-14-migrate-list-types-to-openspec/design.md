## Context

The accepted list-type contract currently lives in
`docs/outliner/list-types.md`; `openspec/specs/` has no product capabilities yet.
Four outliner documents link to the current owner, and `openspec/MIGRATION.md`
names `outliner-list-types` as the next migration. Focused unit and E2E coverage
support the documented behavior, while `docs/legacy-backlog.md` records no
exception for it.

## Goals / Non-Goals

**Goals:**

- Move the complete durable, observable `outliner-list-types` contract to one
  main spec.
- Preserve working links and advance the migration manifest.
- Use the migration as a small validation of the established workflow.

**Non-Goals:**

- Change list, checked-state, selection, or keyboard behavior.
- Describe storage representation, Lexical nodes, commands, or plugin structure.
- Migrate adjacent outliner capabilities.

## Decisions

### Express the contract as observable behavior

The main spec retains the supported types, level-local switching, visible and
persistent checked state, recursive targeting, multi-note target-state rule,
and keyboard entry point. It omits the former raw presence representation
because persistence and unchecked behavior define the durable product contract
without fixing an implementation encoding.

### Move ownership atomically

The implementation creates the main spec, removes the former normative file,
and repairs every inbound link in one change. Keeping a redirect or summary in
`docs/outliner/list-types.md` would create a second apparent owner.

### Advance only one migration step

The manifest records `outliner-list-types` as complete and names exactly one
next capability. Selecting that capability remains migration sequencing, not
part of the `outliner-list-types` product contract.

## Risks / Trade-offs

- A rule could be weakened while being rewritten more minimally. → Compare the
  delta against the current document and its focused tests before removing the
  old owner.
- Links could continue targeting the removed document. → Search the complete
  repository for inbound references and run Markdown link validation.
