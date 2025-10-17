# TODO

## Centralize environment config access

Introduce a `#config` alias that re-exports a central `config` object (option 1
from the proposed approaches). The module should encapsulate `import.meta.env`
usage and expose fields like `env`, `dev`, and future shared flags so features
can read configuration without touching environment globals directly. This
change should replace the current `dev` flag sourced from the editor config, and
allow us to remove the existing `#env` alias by routing all environment access
through the new module.

## Align note indent/outdent helpers with Lexical

1. `isChildrenWrapper` currently requires the wrapper item to have exactly one
   child, while Lexical’s `isNestedListNode` only checks the first child’s type;
   the stricter check rejects bullets that mix text and nested lists.
2. `$outdentNote` always inserts after the wrapper and never splits siblings,
   diverging from Lexical’s ordering-preserving `$handleOutdent`, so
   first/last/middle children move to unexpected positions.
3. `$indentNote`/`$outdentNote` return booleans and throw generic `Error`s,
   whereas Lexical silently no-ops or raises formatted dev invariants; the
   reporting style is inconsistent.
4. `getOrCreateChildList` omits copying text format and style from the source
   list/item, unlike Lexical, so new wrappers lose typography.
5. The helpers attempt to auto-heal malformed wrappers by removing them instead
   of surfacing invariants like Lexical does.
