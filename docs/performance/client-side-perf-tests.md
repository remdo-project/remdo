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
   - Run larger bench:
     `pnpm run perf:bench:8x5`
7. Manual interactive mode:
   - Load default perf workload into collab doc:
     `pnpm run perf:load`
   - Load larger workload into collab doc:
     `pnpm run perf:load:8x5`

## Optional Experiments (Add Only If Useful)

Everything below is optional and should be added only after observing concrete
value from the minimal version.

1. Add `generate-if-missing` mode for benchmarks.
   - Not needed currently because `perf:bench` always pre-generates.
2. Override benchmark defaults (`warmupIterations`, `warmupTime`, `iterations`,
   `time`) when noise is proven.
3. Add baseline storage and delta output/regression gates.
4. Add absolute floor + ratio threshold if tiny-ms cases are noisy.
5. Add extra stats (`mean`, `p95`, raw samples) for diagnostics.
6. Add richer output formatting or platform tagging.
7. Add dynamic target discovery if workloads stop being regular.

## Current Repository Note

The current implementation is a fixture-only Vitest Bench runner in
`tests/perf/**`, plus a separate workload generator:

1. `PERF_WORKLOAD=<workloadId> pnpm run perf:bench` (auto-runs `perf:generate` first)
2. `pnpm run perf:load` / `pnpm run perf:load:8x5` for manual collab repro
