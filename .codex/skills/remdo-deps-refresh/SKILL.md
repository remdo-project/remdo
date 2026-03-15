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
6. Use `gh` to check for still-open Dependabot PRs and GitHub Dependabot alerts. Make sure the
   refresh covered them; if safe follow-up updates are still needed, do them. Only leave items
   open when they are intentionally held back or need manual takeover.
7. For minor or major dependency changes, read the official changelog/release notes and
   look for chances to simplify RemDo by using newly provided functionality.
8. Stop and hand over when the update needs a broad migration, ambiguous behavior changes, or a larger refactor.
