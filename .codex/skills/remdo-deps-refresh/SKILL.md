---
name: "remdo-deps-refresh"
description: "Use when refreshing RemDo dependencies. Run the workspace dependency refresh script, fix only straightforward fallout, then review CI warnings, tooling freshness, and notable release notes for simplification opportunities."
---

# Dependency Refresh

Happy path only.

1. Run `pnpm run deps:refresh`.
2. During fallout fixing, also run `pnpm run audit:unused:zero`,
   `pnpm run audit:dup:zero`, and `pnpm run audit:stats:strict`.
3. If `audit:stats:strict` fails, inspect the reported delta first. If the
   change is an intentional, local result of the dependency refresh, update the
   baseline with `pnpm run audit:stats:update`; do not blindly refresh the
   baseline without checking what changed.
4. Re-run the full check set as a final verification, since fallout fixes
   invalidate the earlier run that `pnpm run deps:refresh` did internally. Get
   `pnpm run lint`, `pnpm run audit:unused:zero`, `pnpm run audit:dup:zero`,
   `pnpm run audit:stats:strict`, `pnpm run test:unit:full`,
   `pnpm run test:collab:full`, and `pnpm run test:e2e` green. This skill always
   runs the full suites regardless of agent mode — it overrides the local
   changed-only quick-check rule, because a dependency refresh is rare and can
   break anything.
5. If checks fail, fix only direct, local fallout and rerun the relevant checks.
6. Review [dependency-maintenance.md](../../../docs/dev/dependency-maintenance.md)
   after dependency or runtime updates. Drop obsolete workarounds and re-check
   whether any held-back versions can now move.
7. Review CI/tooling follow-ups separately when relevant:
   1. Check recent CI annotations/log warnings that are not already covered by local checks.
      Treat each hit as one of:
      `fix now`, `suppress or ignore intentionally`, `add a deterministic check`, or `track as upstream noise`.
   2. Review tooling freshness for key non-app surfaces:
      `package.json` (`packageManager`, `engines.node`), `docker/Dockerfile`, GitHub Actions under `.github/**`,
      and other tools installed outside the workspace lockfile.
      Treat each stale item as one of:
      `upgrade now`, `keep pinned intentionally`, or `defer with reason`.
8. Use `gh` to reconcile still-open Dependabot PRs and GitHub Dependabot alerts against both the
   current branch and the default branch. Classify each item as:
   `covered here` (fixed on this branch, pending merge),
   `already on default branch` (stale GitHub item),
   `unresolved` (safe follow-up still needed),
   or `blocked intentionally` (documented hold-back or manual takeover).
   Do any safe unresolved follow-up updates. Do not treat `covered here` items as open decisions.
9. For minor or major dependency changes, read the official changelog/release notes and
   look for chances to simplify RemDo by using newly provided functionality.
10. Stop and hand over when the update needs a broad migration, ambiguous behavior changes, or a larger refactor.

## Final Response

Return a concise summary with these sections:

1. **Refresh result** — what `pnpm run deps:refresh` changed (notable version
   bumps) and any fallout fixed.
2. **Docs reviewed** — whether `dependency-maintenance.md` workarounds or
   held-back versions could be dropped or moved.
3. **CI/tooling follow-ups** — each reviewed item with its verdict
   (`fix now` / `suppress` / `add check` / `upstream noise`; `upgrade now` /
   `keep pinned` / `defer`).
4. **Dependabot reconciliation** — each item classified (`covered here` /
   `already on default branch` / `unresolved` / `blocked intentionally`).
5. **Handed over** — anything stopped per step 10. Omit if none.
6. **Checks** — list each final verification command with its pass/fail result.
