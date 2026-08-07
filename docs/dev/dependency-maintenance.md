# Dependency Maintenance

## Dependency patches

Local patches correct upstream defects that affect RemDo at runtime. Each patch
applies to one exact dependency version and has a focused regression that fails
without the correction. An upgrade retires the patch when the regression passes
against upstream; otherwise, it carries the correction forward for the new version.

## Security alerts

GitHub dependency monitoring produces vulnerability alerts and security-update
pull requests for the [dependency refresh workflow](../../.agents/skills/remdo-deps-refresh/SKILL.md) to reconcile.
