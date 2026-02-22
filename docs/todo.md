# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Tooling

- Consolidate repeated unit-test Lexical DOM setup (`document.createElement` +
  `document.body.append` + `createEditor` + `setRootElement`) into a shared
  test helper with a single cleanup path.
- Clean up port assignment flow across `tools/env.defaults.sh`, `tools/env.sh`,
  and Playwright webServer startup so derived ports are always recomputed from a
  single base without manual `env -u ...` clearing.
- Use `playwright.config.ts` (`test:e2e:dev` webServer command) as the example:
  stale exported `HMR_PORT`/derived vars required explicit unsets to avoid
  collisions when only `PORT` changed.

## Test doc-id lifecycle hygiene (deferred)

- We currently mix two strategies in tests:
  random doc IDs (which can leave per-run collab data on disk) and repeatable
  doc IDs (which require explicit pre-test cleanup and add runtime cost).
- Plan a unified test doc-id lifecycle approach so data isolation and cleanup
  are deterministic without ad hoc per-suite behavior.

## Collaboration architecture roadmap [Future]

### Stages and success criteria

1. ✅ Done **Stage 0: single hub, online-first.**
   Success: one server is the single collaboration backend for docs.
2. ✅ Done **Stage 1: offline doc persistence.**
   Success: an already-opened doc can be edited offline and syncs on reconnect.
3. ✅ Done **Stage 2: offline app-shell loading.**
   Success: the app shell can open offline (for example via PWA caching), even
   before document data sync is available.
4. **Stage 3: multi-hub client.**
   Success: one client can browse/edit docs from multiple trusted hubs.
5. **Stage 4: local vault hub (optional).**
   Success: local-only docs behave like normal docs and remain device-local.

### Implementation tracks

1. **Offline correctness**
   - Define first-open-offline behavior when no local doc copy exists.
   - Define durability/recovery UX when local storage is cleared or evicted.
2. **Multi-hub ergonomics**
   - Decide routing/origin model for multi-hub usage (gateway vs explicit per-hub
     config).
   - Model auth/token behavior per hub.
3. **Access-control edge cases**
   - If read-only access is introduced, ensure local/offline channels do not
     violate intended permissions.

## To discuss

1. **Offline support guard is runtime safety, not just a test workaround.**
   - Keep capability gating for `offlineSupport` in runtime provider creation;
     insecure contexts can lack `crypto.subtle`, and unguarded enablement can
     crash startup.
2. - Add a dedicated offline-focused e2e slice for IndexedDB behavior
     (reopen/reconnect/recovery) in a trustworthy origin.
