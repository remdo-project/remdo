# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Tooling

- ✅ Done: Editor-focused e2e tests now use an `/e2e/n/:docRef` route that
  renders the document editor shell without app chrome.
- Consolidate repeated unit-test Lexical DOM setup (`document.createElement` +
  `document.body.append` + `createEditor` + `setRootElement`) into a shared
  test helper with a single cleanup path.

## Test doc-id lifecycle hygiene (deferred)

- We currently mix two strategies in tests:
  random doc IDs (which can leave per-run collab data on disk) and repeatable
  doc IDs (which require explicit pre-test cleanup and add runtime cost).
- Plan a unified test doc-id lifecycle approach so data isolation and cleanup
  are deterministic without ad hoc per-suite behavior.

## Collaboration architecture roadmap [Future]

Roadmap vocabulary and implementation planning from `temp.md` live here until
promoted into dedicated spec docs.

### Stages and success criteria

1. **Stage 0: single hub, online-first.**
   Success: one server is the single collaboration backend for docs.
2. **Stage 1: offline doc persistence.**
   Success: an already-opened doc can be edited offline and syncs on reconnect.
   Scope note: this is offline doc state, not necessarily offline app-shell
   loading.
3. **Stage 2: multi-hub client.**
   Success: one client can browse/edit docs from multiple trusted hubs.
4. **Stage 2.5: local vault hub (optional).**
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
