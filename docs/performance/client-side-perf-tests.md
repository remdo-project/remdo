# Client-Side Performance Tests

## Minimal Spec (Start Here)

This is the minimal baseline we should run first.

1. Scope: client-side editor behavior only (`tests/perf/**`).
2. Modes:
   - `non-collab`
   - `collab`
3. Metric: `medianMs` per operation.
4. Workloads:
   - `flat`
   - `balanced-8x3`
5. Operations:
   - add note
   - reorder note (within parent)
   - reorder note (between parents)
   - delete note
   - type character
6. Benchmark settings: use Vitest Bench defaults (no custom tuning for warmup,
   sample count, or run time in the initial implementation).

## Optional Experiments (Add Only If Useful)

Everything below is optional and should be added only after observing concrete
value from the minimal version.

1. Override benchmark defaults (`warmupIterations`, `warmupTime`, `iterations`,
   `time`). Recommendation: first optional experiment if early runs look
   unstable or too noisy.
2. Absolute floor + ratio threshold (for example `max(absMs, ratio*baseline)`).
   Recommendation: add when small-ms operations create noisy false positives.
3. Extra metrics (`mean`, `p95`, raw samples). Recommendation: add for
   diagnosis, not as first-line gate.
4. Manual collab repro flow and special repro scripts. Recommendation: keep as
   debugging aid, not required for base gate.
5. Environment-driven tuning (`PERF_*` overrides). Recommendation: add only if
   fixed defaults block normal usage.
6. Dynamic workload target discovery. Recommendation: keep static/hardcoded
   targets unless fixtures become dynamic.
7. Rich custom output formatting. Recommendation: add only if default output
   slows decision-making.
8. Baseline storage + delta comparison against committed values.
   Recommendation: add after we confirm that raw median snapshots are useful.
9. Regression gate/pass-fail policy. Recommendation: add only when we are ready
   to block on perf regressions.
10. Dedicated scripts for baseline lifecycle (`test:perf`, `:init`, `:update`).
    Recommendation: add once baseline compare is adopted.
11. Formal run model (`mode x workload x operation`, fixed sample count,
    median computed from repeated runs). Recommendation: add if we need stricter
    reproducibility across runs.
12. Metric rationale section (why median vs alternatives).
    Recommendation: add when comparing candidate metrics.

## Optional Guardrails

These are small safety additions that can improve trust in results without
changing the core benchmark matrix.

1. Fail fast when a benchmark case produces no samples.
   Recommendation: add early; this prevents silent `NaN`-style output.
2. Validate mode coherence (`collab` mode requires `COLLAB_ENABLED=true`,
   `non-collab` requires `false`).
   Recommendation: add when wiring CI scripts to avoid misconfigured runs.
3. Distinguish "missing baseline" from "regression detected" as separate
   failure classes.
   Recommendation: add with baseline compare for clearer failure triage.
4. Keep manual repro output machine-readable (`workload=`, `docId=`, `url=`).
   Recommendation: add when manual repro is used by multiple developers.
5. Include runtime version in platform identity (for example Node major).
   Recommendation: add with per-platform baselines to avoid runtime-mix noise.
6. Track confidence/noise metrics (for example RME) as a run-quality signal.
   Recommendation: use for diagnostics before tightening regression gates.
7. Keep Vitest Bench API usage up to date with the current signature.
   Recommendation: verify benchmark call shape on Vitest upgrades.

## Current Repository Note

The current implementation is the minimal Vitest Bench matrix in
`tests/perf/**` plus two run scripts:

1. `pnpm run test:perf`
2. `pnpm run test:perf:collab`
