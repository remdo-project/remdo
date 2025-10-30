# Testing Guide

## Unit Tests

1. Run `pnpm run test:unit` for the default suite. The command forces `COLLAB_ENABLED=false`, so tests use isolated in-memory editors without the websocket server.
2. Run `pnpm run lint` before pushing changes; the `test:unit` script is also included in `pnpm run check`.

## Collaboration Mode

1. Run `pnpm run test:unit:collab` to execute the same unit suite plus the additional files under `tests/unit/collab/` with `COLLAB_ENABLED=true`.
2. The Vitest configuration automatically:
   - disables worker pools (`pool: 'threads'` with `singleThread`) and `fileParallelism` so collab specs run sequentially against the single websocket server;
   - resets the shared document inside `beforeEach` when collaboration is enabled and waits for sync before each test starts.
3. Because tests run in a single thread, the collab run is slower; use it when you need to validate realtime behaviour or before landing changes that affect collaboration.
4. After each test, the harness still waits for a full sync to flush outstanding updates to the Yjs server, so no additional teardown is required.

## Tips

- If a collab test appears to hang, ensure the websocket server started correctly (`tests/unit/_support/services/collab-server.ts` handles bootstrapping).
- The harness lifts Node’s default listener limit, so `MaxListenersExceededWarning` should not appear. If it does, restart the run to ensure the websocket server shuts down cleanly.
