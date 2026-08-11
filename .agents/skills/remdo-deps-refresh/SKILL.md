---
name: remdo-deps-refresh
description: Refresh every available RemDo dependency and repository-owned runtime or tooling pin, repair resulting breakage, and defer unsafe updates as a participant in an approved repository change. Use when a caller supplies the contract's required call; do not use as the developer-facing change entry.
---

# RemDo Dependency Refresh

Run the authoritative
[`remdo-deps-refresh`](../../../docs/specs/agents/skills/remdo-deps-refresh.md)
contract. Use the commands below for repository-specific execution; let the
contract own behavior and the result shape.

## Accept the run

Require the authoritative contract's [`Call`](../../../docs/specs/agents/skills/remdo-deps-refresh.md#call)
as literal YAML before starting the run.

Keep an in-memory inventory of tooling categories deferred during this
invocation. Do not persist that inventory; a later invocation retries every
tooling category.

Before normal selection, run `pnpm run todo:list` and retry each package
deferral recorded under `updateConfig.ignoreDependencies`, in file order:

1. Record the package selectors and associated constraints, then remove their
   `TODO(deps):` marker, ignore entries, and any override or workaround that
   keeps the dependency at its deferred version.
2. Run `pnpm update --latest --workspace-root <selectors>` and normalize
   `pnpm-workspace.yaml` with `CI=1 pnpm exec eslint --fix
   pnpm-workspace.yaml`.
3. Reject a resolved-version downgrade. Use the marker's rationale to add
   applicable verification; run `pnpm run audit:security` for a
   security-related deferral.
4. Reconcile and verify this update as described below. If no package version
   changes, first confirm that the resolved graph satisfies the deferred update
   and no remaining pin prevented the retry; only then is the removed deferral
   the selected change.

Reconsider other `TODO(deps):` and `FIXME(deps):` workarounds only when a
selected update affects them.

## Select updates

Walk the following categories in order, excluding tooling categories deferred
during this invocation. Stop at the first category that changes the repository,
reconcile that refresh unit, and restart at category 1 after committing it. A
category that produces no diff advances to the next category.

1. Refresh workspace packages with `pnpm update --latest --workspace-root`,
   then normalize `pnpm-workspace.yaml` with `CI=1 pnpm exec eslint --fix
   pnpm-workspace.yaml`.
2. Refresh the package-manager release and Corepack integrity with `corepack use
   pnpm@latest`.
3. Inspect Node's official release index and the published official
   `node:<major>.<minor>-alpine` Docker tags. Select the newest LTS release in
   the newest LTS major that has an available image; try older releases within
   that major when a tag is confirmed absent, but do not cross to an older
   major. Apply the selected full or minor release, as appropriate, to
   `package.json`, `pnpm-workspace.yaml`, `docker/Dockerfile`, and
   `.github/actions/setup-pnpm/action.yml`. Verify that all four edits landed,
   then run `pnpm run audit:policy`.
4. Enumerate distinct bare `uses: owner/repository@vN` references under
   `.github/`. Query each repository's latest stable release with `gh api`, and
   update every occurrence when its major is newer. Leave local references and
   more-specific version tags unchanged.

Treat a confirmed absence of a latest GitHub release as a no-op for that
reference. Treat a missing required tool, network or API failure, ambiguous or
malformed version, unverifiable edit, or unavailable Node image throughout the
newest LTS major as a failed run rather than a no-op.

After a complete pass produces no update, run `pnpm run audit:policy`.

## Reconcile an update

Keep each selected update and its corrections as one refresh unit.

1. Inspect the update and apply every correction established by accepted
   behavior and verification evidence. Use release notes when they help
   identify migration work or behavior worth reporting.
2. Follow the specification's
   [dependency-patch procedure](../../../docs/specs/agents/skills/remdo-deps-refresh.md#dependency-patches).
   To test an upgraded dependency without its registered patch, remove the
   registration, install, and run the focused regression named beside it. A
   proposed new patch enters the deferral path without prompting during the run.
3. Record a dependency-specific workaround introduced or retained during repair
   with the exact `TODO(deps):` or `FIXME(deps):` marker under the
   [tracked-comment policy](../../../CONTRIBUTING.md#code-comments).
4. After the latest mutation, run `pnpm run typecheck`, `pnpm run lint:code`,
   the dependency-specific focused tests and other applicable focused lint, and
   `CI=true pnpm install --no-frozen-lockfile`.
5. When verification passes, commit the complete refresh unit and select again.

When a pnpm-major update leaves `node_modules` linked by the old store, run
`CI=true pnpm install --no-frozen-lockfile` before retrying the selector. When a
workspace update obscures the package causing a failure, isolate it by applying
smaller package groups from the preceding committed state.

## Defer an update

Follow the specification's deferral path, including restoring and verifying the
preceding dependency state. Add package selectors to
`updateConfig.ignoreDependencies`. For a tooling category, add the category to
the in-memory inventory. Keep the committed `TODO(deps):` reason beside a
comment-capable selector or configuration owner.

## Finish

After no update remains selectable, run `pnpm install --frozen-lockfile` and
`pnpm run audit:cleanup`.

Then inspect open Dependabot alerts and security-update pull requests with `gh`.
Report each as `covered here`, `already on default branch`, `unresolved`, or
`blocked intentionally`.

Return the specification's
[`Result`](../../../docs/specs/agents/skills/remdo-deps-refresh.md#result) to the
caller, including every update commit, correction, patch and follow-up
disposition, Dependabot disposition, and verification result. The caller owns
the complete change scope and developer-facing report.
