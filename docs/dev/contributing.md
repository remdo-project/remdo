# Contributing

RemDo's contribution contract gives contributors and reviewers the same
baseline for judging a change's intent, supported environments, compatibility,
and follow-up.

Durable documentation has its own contract in
[Documentation](../documentation.md).

## Git Workflow

`origin/main` is the review baseline for committed changes.

Topic branches use `<type>/<short-kebab-case-description>`. The prefix
identifies the branch's primary outcome:

- `feat/` introduces a capability.
- `fix/` corrects a defect.
- `refactor/` restructures implementation while preserving accepted behavior.
- `perf/` improves performance.
- `chore/` handles repository maintenance, including dependencies, automation,
  and tooling.
- `docs/` changes documentation without changing implementation.

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
