# Contributing

## Git Workflow

RemDo protects the shared history by keeping `main` locked down: no direct
pushes, and every change flows through a reviewed pull request. Cut topic
branches from `main` so review surfaces against the canonical baseline. `dev`
is the integration/staging branch—use it for coordination and test merges, but
it does not need a perfectly linear history.

Create topic branches off `main` using clear prefixes so intent is obvious:

- `feat/` for new user-facing capabilities.
- `fix/` for bug patches.
- `refactor/` for structural or technical debt cleanups that do not change
  behavior.
- `chore/` for maintenance tasks such as dependency bumps or tooling tweaks.
- `docs/` for documentation-only work.

Push early and keep the branch focused on a single concern so reviews stay
quick.

## Runtime Baseline

RemDo only targets the runtimes declared in `package.json`:

- **Node.js:** see `package.json#engines.node`.
- **Browsers:** see `package.json#browserslist` (production + development
  targets).

### Implications

1. **No legacy shims.** Assume the DOM/JS APIs shipped in those engines are
   available. Don’t add defensive checks that only make sense for older browsers
   (for example `typeof selection.extend === 'function'`). Use the API directly
   or document a real compatibility issue before adding guards.
2. **Modern syntax is fine.** Feel free to use Stage-4 ECMAScript features
   supported by the browserslist (optional chaining, nullish coalescing, `??=`,
   etc.) without back-compat branches.
3. **Tests should reflect the baseline.** When reproducing bugs, rely on jsdom +
   the supported engines. Don’t introduce polyfills that mask incompatibilities
   outside the supported set.

Refer to this section whenever compatibility concerns come up; if you need to
support a new platform, update `package.json` first so the baseline stays
authoritative.

## Compatibility Policy (Pre-1.0)

RemDo is currently pre-1.0. Backward compatibility is not guaranteed unless a
task or spec explicitly says otherwise.

Default policy:

1. Do not preserve legacy persisted-data formats by default.
2. Do not preserve legacy ID, route, or internal-schema shapes by default.
3. Do not plan migration paths or compatibility shims unless explicitly
   requested.
4. Review feedback should not raise backward-compatibility-only concerns unless
   the task/spec explicitly requires compatibility.
5. If a change intentionally includes backward-compatible behavior, call that
   out in the task wrap-up message rather than as a review finding.

## Documentation

See `docs/index.md` for documentation navigation and maintenance rules:
documentation map, doc workflow, and documentation invariants.

## Environment

See `docs/environment.md` for the canonical environment setup across dev, tests,
prod, backup machines, and CI.
