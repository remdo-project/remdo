# Running Tests

This guide owns setup and invocation for supported procedures in the
[Verification run mode](../run-modes.md#verification). The contributor
[testing policy](../dev/testing.md) owns coverage, test selection, and
verification lifecycle; the
[Test Harness](../specs/testing/test-harness.md) owns runtime lifecycle,
isolation, and diagnostics. The
[package scripts](../../package.json) own executable commands and their variants.

## Prepare the Workspace

Complete the Local Development [workspace preparation](local-development.md#prepare-the-workspace) first. Each test command
starts and stops the services required by its Test Harness lifecycle.

### Prepare Chromium

Before the first `pnpm run test:e2e` invocation, locate or install Chromium:

1. If `PLAYWRIGHT_BROWSERS_PATH` contains the required Chromium build, use it
   as-is, including when the cache is read-only.
2. Otherwise, use an existing build from a standard Playwright cache when one
   is available.
3. If no build is available, select a writable cache and run:

   ```sh
   pnpm exec playwright install chromium
   ```

   Use that same cache for the test run. Override `PLAYWRIGHT_BROWSERS_PATH`
   first when it names a read-only or missing cache without the required build.

Docker E2E resolves a writable Chromium cache as part of its command.

### Prepare Docker

Docker E2E requires a running Docker daemon. When the daemon is rootless, it
requires Docker Engine 29.5 or newer.

## Run Verification

Prefer changed variants locally for unit and collaboration tests. They use
Git-based dependency heuristics and pass when they find no tests. Use an
unsuffixed command with a file or filter for known relationships the heuristic
cannot discover; without one, it runs the complete group used by CI.

- `pnpm run test:unit:changed` / `pnpm run test:unit` — run ordinary tests with
  collaboration disabled; use for the default code feedback.
- `pnpm run test:collab:changed` / `pnpm run test:collab` — run ordinary and
  dedicated collaboration tests with collaboration enabled; use when behavior
  must also hold through collaboration.
- `pnpm run test:e2e` — run browser scenarios; use a file or filter for affected
  user workflows, or no filter for the complete CI group.
- `pnpm run test:e2e:docker` — verify the production container; use for Docker
  and production-runtime changes.
- `pnpm run test:e2e:all` — run browser and Docker E2E; use when complete E2E
  coverage is requested.
- `pnpm run typecheck` and applicable `lint:*` scripts — check affected static
  surfaces.
- `pnpm run audit:policy` — check dependency-policy changes.
- `pnpm run check:dev-boundary` — check production-boundary changes.

CI runs the complete required static set.
