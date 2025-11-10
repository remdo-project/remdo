# TODO

## Centralize environment config access

Introduce a `#config` alias that re-exports a central `config` object (option 1
from the proposed approaches). The module should encapsulate `import.meta.env`
usage and expose fields like `env`, `dev`, and future shared flags so features
can read configuration without touching environment globals directly. This
change should replace the current `dev` flag sourced from the editor config, and
allow us to remove the existing `#config/server` alias by routing all environment
access through the new module.

## Align note indent/outdent helpers with Lexical

1. `isChildrenWrapper` currently requires the wrapper `ListItemNode` to have exactly one
   child, while Lexical’s `isNestedListNode` only checks the first child’s type;
   the stricter check rejects bullets that mix text and nested lists.
2. Provide explicit helpers for the current **Outdent** behavior (append the
   subtree directly after the former parent) so editor commands do not need to
   reimplement the tree juggling.
3. `$indentNote`/`$outdentNote` return booleans and throw generic `Error`s,
   whereas Lexical silently no-ops or raises formatted dev invariants; the
   reporting style is inconsistent.
4. `$getOrCreateChildList` omits copying text format and style from the source
   `ListNode`/`ListItemNode`, unlike Lexical, so new wrappers lose typography.
5. The helpers attempt to auto-heal malformed wrappers by removing them instead
   of surfacing invariants like Lexical does.

### Follow-up: In-place Outdent

- Add an optional in-place outdent variant (preserve preorder position) once
  the helper layer above is solid, and document it alongside the existing
  outdent behavior.

## Harden editor schema validator tests

1. Extract shared builders for editor schema fixtures to cut duplication.
2. Add passing fixture for wrapper `ListItemNode`s with valid preceding siblings.
3. Add mixed valid/invalid nested list fixture to confirm validator behavior.
4. Reuse editor schema fixtures across other tests that need serialized states.

## Add minifyEditorState round-trip test coverage

Evaluate adding a test that loops through every JSON fixture, runs
`minifyEditorState`, loads the result into Lexical, then re-serializes and
compares to the original data structure.

Options to consider when implementing:

1. Extend the existing `lexicalLoad` harness with a variant that accepts raw
   JSON (no temp files). Pros: reuses the established editor config. Cons:
   requires a small refactor of the helper.
2. Spin up a headless `LexicalEditor` directly inside the test. Pros: minimal
   setup, fast. Cons: must ensure node registrations/config match the main
   editor to avoid false diffs.
