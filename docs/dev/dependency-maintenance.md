# Dependency Maintenance

Used during dependency refresh work. This file holds only **standing policy** —
durable rules and self-healing mechanisms that change when a *mechanism* changes,
not when a version moves.

## Standing policy

### Dependency patches

Use `patchedDependencies` only for an upstream defect that requires a local
runtime correction. Each patch uses an exact package version and has a focused
regression test that fails against the unpatched package. Keep pnpm's default
unused-patch failure enabled so an upgrade must either retire a fix already
provided upstream or regenerate the patch for the new version.

### Security alerts

GitHub dependency monitoring produces vulnerability alerts and security-update
pull requests for the
[dependency refresh workflow](../../.agents/skills/remdo-deps-refresh/SKILL.md)
to reconcile.
