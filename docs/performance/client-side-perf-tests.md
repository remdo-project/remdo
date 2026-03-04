# Client-Side Performance Tests

## Minimal Spec (Start Here)

This is the minimal baseline we should run first.

1. Scope: client-side editor behavior only (`tests/perf/**`).
2. Bench mode: `non-collab` only.
3. Metric: Vitest Bench default output (focus on median).
4. Workloads:
   - `<branch>x<depth>` from `data/perf/<id>.json` (for example `8x3`).
5. Operations:
   - add note
   - reorder note (within parent)
   - reorder note (between parents)
   - delete note
   - type character (start)
   - type character (middle)
   - type character (end)
6. Workflow:
   - Run bench (auto-generates selected workload first):
     `PERF_WORKLOAD=8x3 pnpm run perf:bench`
   - Run larger bench: `pnpm run perf:bench:8x5`
   - Run a single operation (useful for fast experiments):
     `pnpm run perf:generate && pnpm exec vitest bench -c vitest.bench.perf.config.mts --run -t "add note"`
7. Manual interactive mode:
   - Load default perf workload into collab doc: `pnpm run perf:load`
   - Load larger workload into collab doc: `pnpm run perf:load:8x5`

## Current Repository Note

The current implementation is a fixture-only Vitest Bench runner in
`tests/perf/**`, plus a separate workload generator:

1. `PERF_WORKLOAD=<workloadId> pnpm run perf:bench` (auto-runs `perf:generate`
   first)
2. `pnpm run perf:load` / `pnpm run perf:load:8x5` for manual collab repro

## Typing-Latency Optimizations

1. Skip full schema validation on leaf-only typing updates.
   - What to do: in `SchemaValidationPlugin`, use `dirtyLeaves`/`dirtyElements`
     and run `validateSchema()` only for structural (intentional non-root
     element) updates.
2. Skip root-shape repair scans for typing-like updates.
   - What to do: in `RootSchemaPlugin`, avoid `$shouldNormalizeOutlineRoot(...)`
     checks when update contains dirty leaves but no intentional non-root
     element mutations.
3. Avoid redundant structural overlay writes in selection updates.
   - What to do: in `SelectionPlugin`, cache previous structural range/active
     state and only call `updateStructuralOverlay(...)` when range/activity
     actually changes.
4. Avoid redundant outline-selection store writes.
   - What to do: in `SelectionPlugin`, compare next `OutlineSelection` with
     current stored selection and call `editor.selection.set(...)` only when it
     differs.
