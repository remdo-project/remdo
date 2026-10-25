# Contributing to RemDo

RemDo's contribution contract gives contributors and reviewers the same
baseline for judging a change's intent, supported runtimes and run modes,
compatibility, and follow-up.

Durable documentation has its own contract in [Documentation](docs/documentation.md).
Testing follows the [contributor testing policy](docs/dev/testing.md).

## Git Workflow

`origin/main` is the default review baseline for committed changes. Work
explicitly targeting an integration branch uses that branch instead.

`deploy-test` is a mutable deployment pointer for the hosted test sandbox.
Do not develop, merge, or base review work on it. `pnpm hosted:deploy-test`
moves it to the committed `HEAD` selected for deployment.

Topic branches use `<type>/<short-kebab-case-description>`. The prefix
identifies the branch's primary outcome:

- `feat/` introduces a capability.
- `fix/` corrects a defect.
- `refactor/` restructures implementation while preserving [accepted behavior](docs/documentation.md#target-behavior).
- `perf/` improves performance.
- `chore/` handles repository maintenance, including dependencies, automation,
  and tooling.
- `docs/` changes documentation without changing implementation.

Commit subjects use `<type>: <summary>` or `<type>(<scope>): <summary>`. The type
describes that commit's change, the optional scope names the affected area, and
the summary states the concrete result. A commit's type may differ from the
branch prefix because the prefix describes the branch's combined outcome.

## Runtime Baseline

RemDo's supported runtimes are declared by their executable owners:

- **Node.js:** the major/minor series selected by [`package.json`](package.json) `devEngines.runtime.version`.
- **Browsers:** [`package.json`](package.json) `browserslist.production`.
- **Python:** [`pyproject.toml`](pyproject.toml) `requires-python`; [`.python-version`](.python-version) selects the
  development interpreter.

Node.js upgrades select an LTS release with an available matching container image.
Runtime and tooling updates keep their development, CI, and container
declarations consistent.

Code uses runtime APIs available throughout its declared range directly.
Compatibility code addresses differences within a supported range; it does not
extend support beyond the declared runtimes.

## Run-Mode Impact

[Run Modes](docs/run-modes.md) owns RemDo's supported run modes. A change to a shared runtime
boundary considers every applicable mode and verifies each materially distinct
outcome it changes.

## Backward Compatibility (Pre-1.0)

Backward compatibility is outside the default target unless a task or
specification defines it. The default excludes preservation of legacy
persisted-data formats, IDs, routes, and internal schemas, along with migration
paths and compatibility shims. Review feedback treats backward compatibility as
required only when the task or specification does.

## Code Comments

Any standalone `TODO` or `FIXME` label in a code comment is tracked. `FIXME`
records a defect in the current state; `TODO` records other code-local work
worth tracking, such as a workaround, deferred fix, or known gap. Both follow
the repository-wide [tracked follow-up convention](docs/todo.md).

A tracked comment contains its rationale and, when available, the one-line probe
that proves it obsolete, such as deleting the shim, flipping the flag, or
running the relevant suite. The code-local marker is the sole tracking record;
the same work does not also appear in [`docs/todo.md`](docs/todo.md) or another
documentation list. Its proximity to the code exposes it when the workaround is
removed.

## Dependency Updates

Use [Mend-hosted Renovate](https://docs.renovatebot.com/mend-hosted/overview/) with [renovate.json5](renovate.json5) for dependency updates.
Keep [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependabot-alerts) enabled, with Renovate as the sole automated update
PR producer.

Dependency changes preserve workspace catalogs, applicable trust and
build-approval policy, package-manager integrity, and locked runtime and project
dependencies.

Every available update reaches review as a pull request rather than waiting on
dashboard approval; one that cannot merge yet stays open as a draft. The developer
merges or fixes each pull request as it arrives, and a red one is acceptable.
Commits added to a Renovate branch stop Renovate from updating it, so finish that
pull request by merging or closing it.

Dependency-specific workarounds and updater holds follow the
[tracked-comment policy](#code-comments). Remove an affected existing hold only when the
selected update proves its deferral obsolete.

### Dependency patches

The [dependency-patch registry](pnpm-workspace.yaml) inventories exact-version patches for upstream runtime
defects. Each patch records its rationale and a focused regression that fails
without the correction.

For an affected dependency update, retain the patch, regenerate it for the new
exact version, or remove it when its focused regression passes without it. New
dependency patches require developer approval.

## UI Libraries

Overlay and APG widgets use React Aria Components. Mantine remains the
painted form and layout library. Do not implement those widgets with a
Mantine stand-in to match surrounding chrome. Semantic HTML is the
fallback when a React Aria component's contract does not match the
product.
