# Dependency Maintenance

Used during dependency refresh work. This file holds only **standing policy** —
durable rules and self-healing mechanisms that change when a *mechanism* changes,
not when a version moves.

## Standing policy

### pnpm

- `minimumReleaseAge` defaults to `1440` (24h): newly published packages are not
  resolved until they are a day old (supply-chain buffer). We keep the default.
  The refresh `pnpm update --latest` naturally holds too-fresh bumps and applies
  each one automatically on the next run once it ages in. On
  every install pnpm's lockfile verification pass also re-applies the gate to each
  existing lockfile entry (independent of `minimumReleaseAgeStrict`, which only
  governs *resolution*), so even `--frozen-lockfile` in CI hard-fails
  (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`) on a committed entry younger than the
  window.
- Build-script approval uses the `allowBuilds` map in `pnpm-workspace.yaml`.
  With `strictDepBuilds: true` (enabled), an install fails (exit 1) when any
  in-tree dep has a build script not listed in `allowBuilds`, instead of just
  warning. When that happens — e.g. a refresh pulls in a new build-script dep —
  add the dep to `allowBuilds` with `true` (trusted to build) or `false`
  (blocked) before the install can proceed. Keep `allowBuilds` limited to deps
  actually in the tree; drop stale entries.

### Dependency patches

Use `patchedDependencies` only for an upstream defect that requires a local
runtime correction. Each patch uses an exact package version and has a focused
regression test that fails against the unpatched package. Keep pnpm's default
unused-patch failure enabled so an upgrade must either retire a fix already
provided upstream or regenerate the patch for the new version.

### Security alerts

Dependabot compares the default branch's dependency graph with reviewed GitHub
Advisory Database entries. Repository settings enable **Dependabot alerts** and
**Dependabot security updates**, so a vulnerable dependency becomes a tracked
alert and, when Dependabot can resolve it to a patched version, an update pull
request. Alerts and security updates work without `.github/dependabot.yml`.

The [dependency refresh workflow](../../.agents/skills/remdo-deps-refresh/SKILL.md)
owns response: it applies available upgrades and reconciles every open alert and
Dependabot pull request. `audit:security` provides an on-demand registry
cross-check whose failure signal covers high-severity production dependencies.
