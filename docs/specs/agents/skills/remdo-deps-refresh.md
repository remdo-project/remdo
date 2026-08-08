# remdo-deps-refresh

The skill refreshes RemDo's dependencies and repository-owned runtime and
tooling pins, repairs resulting breakage, and returns an
[agent result](../results.md#results). It runs unattended and stops when it
cannot determine a safe resolution.

## Authority

[Repository authority](../instructions.md#repository-authority): autonomous.

## Run

The run checks the following update categories:

1. Workspace package dependencies, including major releases.
2. The package-manager release and its verified integrity.
3. Synchronized supported-runtime pins, using the newest LTS release available
   throughout the repository's runtime surfaces.
4. Floating GitHub Actions major releases.

```text
[confirm clean]
    │
    v
[fetch origin/main]
    │
    v
[create branch from fetched commit]
    │
    v
[select next update]
    ├─ selected ─> [apply update]
    │                  │
    │                  v
    │              [repair if needed]
    │                  │
    │                  v
    │              [verify]
    │                  ├─ pass ─> [commit] ─> [select next update]
    │                  ├─ repairable failure ─> [repair] ─> [verify]
    │                  └─ no safe correction ─> [restore previous state]
    │                                               ├─ failure ─> [report failure]
    │                                               │ restored
    │                                               v
    │                                           [record deferral]
    │                                               │
    │                                               v
    │                                           [verify restored state]
    │                                               ├─ pass, changed ─> [commit] ─> [select next update]
    │                                               ├─ pass, unchanged ─> [select next update]
    │                                               └─ fail ─> [report failure]
    │ none
    v
[inspect Dependabot]
    │
    v
[report]
```

The run applies every correction established by accepted behavior and
verification evidence.

If an update cannot be repaired to pass verification, the run restores the
preceding dependency state, records the deferral under the
[tracked-comment policy](../../../../CONTRIBUTING.md#code-comments), using the
exact `TODO(deps):` marker, and verifies the resulting state. The run skips that
dependency for the remainder of the current run. A later run retries the update;
successful verification removes the marker, otherwise it remains.

A dependency-specific workaround introduced or retained during repair uses the
exact `TODO(deps):` or `FIXME(deps):` marker according to the tracked-comment
policy. Later runs reconsider it when an update affects it.

After no update is selectable, the run inspects open Dependabot alerts and
security-update pull requests. It reports each as covered by the refreshed graph,
already on the default branch, unresolved, or blocked intentionally.

Failure to restore and verify the preceding dependency state stops the run.

### Dependency patches

[The dependency-patch registry](../../../../pnpm-workspace.yaml) inventories
exact-version patches and records each patch's rationale and focused regression.
For each affected registered patch, the run retains it, regenerates it for the
new exact version, or removes it when its focused regression passes without it.
The result reports every disposition.

A new dependency patch requires developer approval; the run defers the update
and reports the proposal.

## Verification

Verification after the latest mutation includes the applicable full repository
checks, end-to-end tests, cleanup audits, and install-consistency check. A
runtime-pin change also includes the repository's container test. The local
result records push-dependent CI coverage as pending.

## Result

The result uses this shape:

```yaml
outcome: <refreshed | current | failed>
concerns: # if any
  - source: <originating step or dependency>
    summary: <condition>
branch: <refresh branch> # if created
base: <fixed fetched origin/main commit> # if resolved
updates: # if any
  - class: <workspace dependencies | package manager | runtime | GitHub Actions>
    summary: <versions or pins changed>
    commit: <committed refresh unit>
    major: true # if applicable
corrections: # if any
  - summary: <upgrade-caused correction>
patches: # if affected
  - dependency: <package>
    disposition: <proposed | retained | regenerated | removed>
follow_up: # if evaluated or changed
  - summary: <dependency-specific follow-up>
    disposition: <removed | updated | retained>
dependabot: # if reconciled
  - item: <pull request or alert>
    disposition: <covered here | already on default branch | unresolved | blocked intentionally>
verification: # if run
  - command: <command>
    status: <passed | failed>
ci: <pending | not-applicable>
reason: <condition that prevented completion> # if failed
```

- `refreshed` means at least one change was committed, no update remains
  selectable, and local verification passed.
- `current` means the run found no repository mutation to make.
- `failed` means a condition prevented the skill from determining or completing
  a safe refresh.
