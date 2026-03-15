---
name: "remdo-deps-refresh"
description: "Use when refreshing RemDo dependencies. Run the workspace dependency refresh script, fix only straightforward fallout, then review runtime/tooling baseline changes and notable release notes for simplification opportunities."
---

# Dependency Refresh

Happy path only.

1. Run `pnpm run deps:refresh`.
2. Before wrapping up, get `pnpm run lint`, `pnpm run test:unit:full`,
   `pnpm run test:collab:full`, and `pnpm run test:e2e` green.
3. If checks fail, fix only direct, local fallout and rerun the relevant checks.
4. Review [dependency-maintenance.md](/home/piotr/projects/remdo/docs/dev/dependency-maintenance.md)
   after dependency or runtime updates. Drop obsolete workarounds and re-check
   whether any held-back versions can now move.
5. Review runtime/tooling baseline updates separately when relevant:
   `package.json` (`packageManager`, `engines.node`), `docker/Dockerfile`, and CI runtime pins.
6. Use `gh` to reconcile still-open Dependabot PRs and GitHub Dependabot alerts against both the
   current branch and the default branch. Classify each item as:
   `covered here` (fixed on this branch, pending merge),
   `already on default branch` (stale GitHub item),
   `unresolved` (safe follow-up still needed),
   or `blocked intentionally` (documented hold-back or manual takeover).
   Do any safe unresolved follow-up updates. Do not treat `covered here` items as open decisions.
7. For minor or major dependency changes, read the official changelog/release notes and
   look for chances to simplify RemDo by using newly provided functionality.
8. Stop and hand over when the update needs a broad migration, ambiguous behavior changes, or a larger refactor.
