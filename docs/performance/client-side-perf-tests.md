# Client-Side Performance Tests

Defines the client-side editor performance benchmark suite: what it measures,
its workloads and operations, and the runner surface.

1. Scope: client-side editor behavior only, benched without collaboration
   (`non-collab`).
2. Runner: a fixture-driven Vitest Bench suite plus a workload generator, both
   in `tests/perf/**`.
3. Metric: Vitest Bench default output; the median is the primary reading.
4. Workloads: generated fixtures named `<branch>x<depth>`, stored as
   `data/perf/<id>.json`.
5. Operations benched:
   - add note
   - reorder note (within parent)
   - reorder note (between parents)
   - delete note
   - type character (start, middle, and end of note)
6. Commands: `PERF_WORKLOAD=<id> pnpm run test:perf:bench` selects a workload
   and auto-generates it before benching (`test:perf:bench:8x5` is the larger
   preconfigured run); a single operation is selected with Vitest's `-t`
   filter.
