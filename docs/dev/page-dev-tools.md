# Page Development Tools

Development-only page tools are app-shell surfaces for inspecting editor and
route behavior during local development and tests. Runtime setup belongs in
[docs/run-modes.md](../run-modes.md).

Dev page tools keep their toolbar entry, route, and rendered component inside a
dev-owned boundary so a tool can be deleted without changing document behavior.
Inline inspectors, such as the editor Lexical tree view, stay behind the same
development/test boundary.

## Lexical Demo

The Lexical Demo toolbar item links to a dedicated dev route,
`/dev/lexical-demo`. That route renders the vanilla Lexical editor and its tree
view as the page's primary content.
