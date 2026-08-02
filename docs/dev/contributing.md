# Contributing

RemDo contributions use topic branches from `origin/main`, the declared runtime
baseline, pre-1.0 compatibility defaults, code-local follow-up markers, and
one-way editor feature boundaries. Documentation changes follow
[Documentation](../documentation.md).

## Git Workflow

`origin/main` is the review baseline for committed changes.

Topic branch prefixes identify the kind of change:

- `feat/` for new user-facing capabilities.
- `fix/` for bug patches.
- `refactor/` for structural or technical debt cleanups that do not change
  behavior.
- `perf/` for performance-related work.
- `chore/` for maintenance tasks such as dependency bumps or tooling tweaks.
- `docs/` for documentation-only work.

## Runtime Baseline

RemDo only targets the runtimes declared in `package.json`:

- **Node.js:** see `package.json#engines.node`.
- **Browsers:** see `package.json#browserslist` (production + development
  targets).

Code uses the DOM and JavaScript APIs available in those runtimes directly.
Stage-4 ECMAScript features supported by the browserslist run without
compatibility branches. Compatibility guards correspond to documented issues
within the supported set. Tests reproduce behavior in jsdom and the supported
engines; shims and polyfills for runtimes outside the declared set are outside
the project baseline.

## Compatibility Policy (Pre-1.0)

Backward compatibility is outside the default target unless a task or
specification defines it. The default excludes preservation of legacy
persisted-data formats, IDs, routes, and internal schemas, along with migration
paths and compatibility shims. Review feedback treats backward compatibility as
required only when the task or specification does.

## Code Comments

`TODO:` and `FIXME:` are the only tracked code-comment markers. `FIXME:` records
a defect in the current state; `TODO:` records other code-local work worth
tracking, such as a workaround, deferred fix, or known gap. Both follow the
repository-wide [tracked follow-up convention](../todo.md#tracked-follow-up).

A tracked comment contains its rationale and, when available, the one-line probe
that proves it obsolete, such as deleting the shim, flipping the flag, or
running the relevant suite. The code-local marker is the sole tracking record;
the same work does not also appear in [`docs/todo.md`](../todo.md) or another
documentation list. Its proximity to the code exposes it when the workaround is
removed.

## Editor Feature Modules

Cohesive editor features live in `src/client/editor/features/<feature>/` and own
their plugin entry points plus related nodes, helper modules, UI, and unit tests.
Colocated `*.spec.ts` and `*.spec.tsx` files in these feature folders are part of
the unit test inventory and follow the same test rules as `tests/unit`.

Dependencies point one way: feature imports point to the shared base
(`runtime/`, `outline/`) or another feature; the shared base does not import a
feature. A capability specific to one feature remains owned by that feature, and
other modules access it by name.
