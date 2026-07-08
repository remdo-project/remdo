# Development Tooling

Development-only tooling supports inspecting and driving the editor and routes
during local development and tests. It spans page tools, editor inspectors,
schema validation, and the test bridge. This doc owns what dev tooling is and the
boundary it lives behind; runtime setup belongs in
[docs/run-modes.md](../run-modes.md).

## Boundary

Dev tooling MUST NOT ship in the production bundle and MUST NOT shape production
code around itself. The boundary is enforced at build time:

- **Build-time gate.** Dev tooling is reachable only through
  `import.meta.env.DEV`-guarded branches — `true` under the dev server and test
  runner, statically `false` in the production build, so the guarded code is
  dead-code eliminated there.
- **Prefer neutral seams.** A production component SHOULD expose a neutral
  extension point for dev tooling rather than reference it directly, but a simple
  direct import or call is acceptable where it keeps the boundary clear and the
  implementation materially simpler.

A production build fails if a dev-tooling marker survives into the bundle, so a
leaked dev surface is caught rather than shipped.

## Page tools

Dev page tools keep their toolbar entry, route, and rendered component inside the
dev boundary.

### Lexical Demo

The Lexical Demo toolbar item links to `/dev/lexical-demo`. That route renders
the vanilla Lexical editor and its tree view as the page's primary content.

## Editor tooling

Schema *validation* is a dev/test assertion; the outline *repair* (root
normalization) it guards is production behavior and stays outside the boundary.
Validation coordinates with production normalization through a
skip-once signal so a normalization pass is not re-validated.
