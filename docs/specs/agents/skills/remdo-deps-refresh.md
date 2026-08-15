# remdo-deps-refresh

The capability refreshes RemDo's dependencies and repository-owned runtime and
tooling pins, repairs resulting breakage, and returns an
[agent result](../protocol.md#results). Once started, it completes the resolved
refresh without developer direction and fails when it cannot determine a safe resolution.

## Call

The [call](../protocol.md#calls) is:

```yaml
guarantees:
  repository:
    branch: topic
    worktree: clean
authority:
  commits: allowed
```

`topic` means a [topic branch](../../../../CONTRIBUTING.md#git-workflow); `allowed` grants [repository authority](../../../../AGENTS.md#repository-authority)
to commit. An absent or incompatible call yields `failed`.

## Run

The run checks the following update categories:

1. Workspace package dependencies, including major releases.
2. The package-manager release and its verified integrity.
3. Synchronized supported-runtime pins, using the newest LTS release available
   throughout the repository's runtime surfaces.
4. Floating GitHub Actions major releases.

```text
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
    │                  └─ unrepairable failure ─> [defer] ─> [select next update]
    │ none
    v
[inspect Dependabot]
    │
    v
[report]
```

Notes:

- Repair applies every correction established by accepted behavior and
  verification evidence.
- If an update cannot be repaired to pass verification, the run restores the
  preceding dependency state and records the deferral under the
  [tracked-comment policy](../../../../CONTRIBUTING.md#code-comments), using the
  exact `TODO(deps):` marker. It verifies the restored state, commits it if it
  changed, and skips that dependency for the remainder of the run. A later run
  retries the update; successful verification removes the marker, otherwise it
  remains. Failure to restore and verify the preceding state stops the run and
  reports failure.
- A dependency-specific workaround introduced or retained during repair uses
  the exact `TODO(deps):` or `FIXME(deps):` marker according to the
  tracked-comment policy. Later runs reconsider it when an update affects it.
- Dependabot inspection reports each open alert and security-update pull request
  as covered by the refreshed graph, already on the default branch, unresolved,
  or blocked intentionally.

### Dependency patches

[The dependency-patch registry](../../../../pnpm-workspace.yaml) inventories
exact-version patches. Each patch corrects an upstream runtime defect and
records its rationale and a focused regression that fails without the
correction. For each affected registered patch, the run retains it, regenerates
it for the new exact version, or removes it when its focused regression passes
without it. The result reports every disposition.

A new dependency patch requires developer approval; the run follows the
deferral path and reports the proposal.

## Verification

Each refresh unit follows the contributor [testing policy](../../../dev/testing.md#verification-lifecycle) before it is
committed. The completed refresh passes dependency cleanup and
install-consistency checks.

## Result

The result uses this complete shape with the shared
[`Concern`](../protocol.md#concerns) type:

```yaml
outcome: <refreshed | current | failed>
reason: <condition that prevented completion> # if failed
concerns: <Concern[]> # if any
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
    disposition: <introduced | removed | updated | retained>
dependabot: # if reconciled
  - item: <pull request or alert>
    disposition: <covered here | already on default branch | unresolved | blocked intentionally>
verification: # if run
  - command: <command>
    status: <passed | failed>
```

- `refreshed` means at least one change was committed, no update remains
  selectable, and local verification passed.
- `current` means the run completed without committing a refresh or follow-up change.
- `failed` means a condition prevented the capability from determining or
  completing a safe refresh.
