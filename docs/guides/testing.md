# Running Tests

This guide owns setup and invocation for supported procedures in the
[Verification run mode](../run-modes.md#verification). The contributor [testing policy](../dev/testing.md) owns evidence quality and
test-level selection; the [Test Harness](../specs/testing/test-harness.md) owns runtime lifecycle, isolation, and
diagnostics. The [package scripts](../../package.json) own executable commands and their variants.

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

## Run Tests

- **Unit Tests:** `pnpm run test:unit`
- **Collaboration Tests:** `pnpm run test:collab`
- **Browser E2E Tests:** `pnpm run test:e2e`
- **Docker E2E Tests:** `pnpm run test:e2e:docker`
