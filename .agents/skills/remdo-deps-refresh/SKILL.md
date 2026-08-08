---
name: remdo-deps-refresh
description: Refresh every available RemDo dependency and repository-owned runtime or tooling pin, repair resulting breakage, defer updates that cannot be made safe, and report the result. Use when the developer invokes $remdo-deps-refresh for an unattended dependency refresh.
---

# RemDo Dependency Refresh

Run the authoritative
[`remdo-deps-refresh`](../../../docs/specs/agents/skills/remdo-deps-refresh.md)
contract. Use the commands below for repository-specific execution; let the
contract own behavior and the result shape.

## Start the run

1. Confirm the repository is clean.
2. Run:

   ```sh
   sh .agents/skills/remdo-deps-refresh/tools/start-refresh-branch.sh
   ```

3. Record the reported branch and base. A non-zero exit produces a failed
   result unless its condition can be resolved safely.

Every invocation starts a new run and branch. Do not resume an earlier refresh
branch. The startup helper also clears the run-local skipped-update inventory.

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
   changes, first confirm that no remaining pin prevented the retry; the removed
   deferral is then the selected change.

Reconsider other `TODO(deps):` and `FIXME(deps):` workarounds only when a
selected update affects them.

## Select updates

Run `pnpm run deps:next`. Its ordered selector covers workspace packages, the
pnpm pin and integrity, synchronized Node pins, and floating GitHub Actions
majors. It stops after the first changed category.

- Exit `3`: reconcile the named update, verify it, commit it, then select again.
- Exit `0`: inspect Dependabot and report the result.
- Any other exit: diagnose the selector failure. Repair and retry it when safe;
  otherwise return a failed result.

The selector skips each exact gate label recorded in
`.agent/remdo-deps-refresh/skipped`.

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
4. After the latest mutation, run `pnpm run check:full`, `pnpm run test:e2e`,
   `pnpm run audit:cleanup`, and `CI=true pnpm install --no-frozen-lockfile`.
   For a Node-pin update, also run `pnpm run test:e2e:docker`.
5. When verification passes, commit the complete refresh unit and select again.

When a pnpm-major update leaves `node_modules` linked by the old store, run
`CI=true pnpm install --no-frozen-lockfile` before retrying the selector. When a
workspace update obscures the package causing a failure, isolate it by applying
smaller package groups from the preceding committed state.

## Defer an update

When following the specification's deferral path, add package selectors to
`updateConfig.ignoreDependencies`. For a tooling category, append its exact gate
label to `.agent/remdo-deps-refresh/skipped`; the committed `TODO(deps):` reason
remains beside a comment-capable selector or configuration owner.

## Finish

After no update remains selectable, inspect open Dependabot alerts and
security-update pull requests with `gh`. Report each as `covered here`, `already
on default branch`, `unresolved`, or `blocked intentionally`.

Return the specification's
[`Result`](../../../docs/specs/agents/skills/remdo-deps-refresh.md#result),
including every update commit, correction, patch and follow-up disposition,
Dependabot disposition, verification result, branch and base. Mark
push-dependent CI as pending.
