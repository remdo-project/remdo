# Development Tooling

Development-only tooling supports inspecting and driving the editor and routes
during local development and tests. This doc owns what dev tooling is and the
boundary it lives behind; runtime setup belongs in
[docs/run-modes.md](../run-modes.md).

## Boundary

Dev tooling MUST NOT ship in the production bundle and MUST NOT shape production
code around itself:

- **Build-time gate.** Dev tooling is reachable only through
  `import.meta.env.DEV`-guarded branches — `true` under the dev server and test
  runner, statically `false` in the production build.
- **Prefer neutral seams.** A production component SHOULD expose a neutral
  extension point for dev tooling rather than reference it directly, but a simple
  direct import or call is acceptable where it keeps the boundary clear and the
  implementation materially simpler.

A production build fails if a dev-tooling marker survives into the bundle.

## Visibility mode

The dev app renders a floating visibility control that toggles dev tooling
between visible and hidden. Dev tooling is visible by default. When visibility is
hidden, dev-only links, panels, and components are absent from the page so the
same dev server can be used to inspect the product-like UI. The floating control
itself remains visible so dev tooling can be restored without a reload.

The visibility state is stored in dev-owned browser storage. It persists across
refreshes, stays local to the current origin, and is not sent with application
requests.

## Page tools

### Lexical Demo

The Lexical Demo toolbar item links to `/dev/lexical-demo`. That route renders
the vanilla Lexical editor and its tree view as the page's primary content.

### Playground

The Playground toolbar item links to `/playground/index.html`. The link 404s
until a playground has been generated in this working dir.

## Editor tooling

Schema *validation* is a dev/test assertion; the outline *repair* (root
normalization) it guards is production behavior.
Validation coordinates with production normalization through a
skip-once signal so a normalization pass is not re-validated.
