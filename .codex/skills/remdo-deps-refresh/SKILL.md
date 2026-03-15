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
4. Review [KNOWN_TEMP_SHIMS.md](./KNOWN_TEMP_SHIMS.md) after dependency or runtime updates and drop any shim that is no longer needed.
5. Review runtime/tooling baseline updates separately when relevant:
   `package.json` (`packageManager`, `engines.node`), `docker/Dockerfile`, and CI runtime pins.
6. For minor or major dependency changes, read the official changelog/release notes and look for chances to simplify RemDo by using newly provided functionality.
7. Stop and hand over when the update needs a broad migration, ambiguous behavior changes, or a larger refactor.
