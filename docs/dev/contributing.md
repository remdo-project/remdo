# Contributing

RemDo's contribution contract gives contributors and reviewers the same
baseline for judging a change's intent, supported runtimes, compatibility,
and follow-up.

Durable documentation has its own contract in
[Documentation](../documentation.md).

## Git Workflow

`origin/main` is the review baseline for committed changes.

Topic branches use `<type>/<short-kebab-case-description>`. The prefix
identifies the branch's primary outcome:

- `feat/` introduces a capability.
- `fix/` corrects a defect.
- `refactor/` restructures implementation while preserving
  [accepted behavior](../documentation.md#target-behavior).
- `perf/` improves performance.
- `chore/` handles repository maintenance, including dependencies, automation,
  and tooling.
- `docs/` changes documentation without changing implementation.

Commit subjects use `<type>: <summary>` or `<type>(<scope>): <summary>`. The type
describes that commit's change, the optional scope names the affected area, and
the summary states the concrete result. A commit's type may differ from the
branch prefix because the prefix describes the branch's combined outcome.

## Runtime Baseline

RemDo's supported runtimes are declared in
[`package.json`](../../package.json):

- **Node.js:** `engines.node`.
- **Browsers:** `browserslist.production`.

Code uses runtime APIs available throughout its declared range directly.
Compatibility code addresses differences within a supported range; it does not
extend support beyond the declared runtimes.

## Backward Compatibility (Pre-1.0)

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
