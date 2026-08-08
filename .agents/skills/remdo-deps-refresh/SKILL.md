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

1. Record the package selectors, then remove their `TODO(deps):` marker and
   ignore entries.
2. Run `pnpm update --latest --workspace-root <selectors>` and normalize
   `pnpm-workspace.yaml` with `CI=1 pnpm exec eslint --fix
   pnpm-workspace.yaml`.
3. Reconcile and verify this update as described below. If no package version
   changes, the removed deferral is still the selected change.

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
2. Reconcile every affected registered
   [dependency patch](../../../docs/specs/agents/skills/remdo-deps-refresh.md#dependency-patches):
   remove its registration, install the upgraded dependency unpatched, and run
   the focused regression named beside the registration. Remove the patch when
   the regression passes; otherwise regenerate it for the new exact version and
   rerun the regression. Report the disposition.
3. Do not create a new patch without developer approval. Follow the deferral
   procedure and report the patch as proposed instead of prompting during the
   run.
4. Record a dependency-specific workaround introduced or retained during repair
   with the exact `TODO(deps):` or `FIXME(deps):` marker under the
   [tracked-comment policy](../../../CONTRIBUTING.md#code-comments).
5. After the latest mutation, run `pnpm run check:full`, `pnpm run test:e2e`,
   `pnpm run audit:cleanup`, and `CI=true pnpm install --no-frozen-lockfile`.
   For a Node-pin update, also run `pnpm run test:e2e:docker`.
6. When verification passes, commit the complete refresh unit and select again.

When a pnpm-major update leaves `node_modules` linked by the old store, run
`CI=true pnpm install --no-frozen-lockfile` before retrying the selector. When a
workspace update obscures the package causing a failure, isolate it by applying
smaller package groups from the preceding committed state.

## Defer an update

If no safe repair passes verification:

1. Restore the complete uncommitted refresh unit to its preceding commit,
   including files introduced by that unit.
2. Record the reason with an exact `TODO(deps):` marker. For a package update,
   also add its package selectors to `updateConfig.ignoreDependencies`. For a
   tooling category, append the exact selector label to
   `.agent/remdo-deps-refresh/skipped`.
3. Verify the restored state with the applicable checks above. Commit the
   deferral when it changed the repository; otherwise leave the preceding commit
   unchanged.
4. Continue with the next selectable update.

Stop and return a failed result if the preceding state cannot be restored and
verified. A later invocation retries package deferrals before normal selection
and tooling deferrals through the selector. Remove a deferral marker only after
the retried update passes verification.

## Finish

After no update remains selectable, inspect open Dependabot alerts and
security-update pull requests with `gh`. Report each as `covered here`, `already
on default branch`, `unresolved`, or `blocked intentionally`.

Return the specification's
[`Result`](../../../docs/specs/agents/skills/remdo-deps-refresh.md#result),
including every update commit, correction, patch and follow-up disposition,
Dependabot disposition, verification result, branch and base. Mark
push-dependent CI as pending.
