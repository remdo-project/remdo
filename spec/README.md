# RemDo Specification

This directory is the authoritative entry point for RemDo's durable product,
development, and operational behavior.

The `research/` subtree contains non-normative evidence and candidate guidance.
`todo.md` is authoritative for temporary work state and known gaps, but does not
define accepted contracts.

## Work markers

Prefix tracked follow-up work with `FIXME:` when the current state contains a
defect; otherwise use `TODO:`.

A rule stated here overrides delegated material. Until a subject moves here,
its accepted behavior remains in its current owner under `docs/` or
`openspec/specs/`. OpenSpec is not a development tool or lifecycle;
`openspec/changes/` and its archives are evidence only.

Delegation excludes the OpenSpec-era
[development change workflow](../openspec/specs/development-change-workflow/spec.md)
and [change verifier](../openspec/specs/agent-skill-remdo-verify-change/spec.md)
contracts. Both remain retired evidence.

New or materially revised durable contracts belong in `spec/`. A migration
moves the complete contract, updates inbound links, and removes the former
normative definition in the same change.

Use [Documentation](../docs/documentation.md) for writing invariants and the
[legacy migration record](../openspec/MIGRATION.md) to locate capabilities that
currently remain under `openspec/specs/`.
