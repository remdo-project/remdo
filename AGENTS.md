# RemDo Agent Guidelines

RemDo is a keyboard-first collaborative outliner built on Lexical. Prefer the
simplest permanent implementation consistent with its accepted contracts.

## Routes

This is the shared repository entry point. Locate task-specific accepted
behavior by filename and scope opener under `docs/`, then read only the current
owner. Provider-specific surfaces may load it alongside their own rules.

- **Instruction design and surface responsibilities:**
  [Agent instructions](docs/specs/agents/instructions.md).
- **Durable documentation:** [Documentation](docs/documentation.md).
  - **Owner categories:**
    [Layout](docs/documentation.md#documentation-layout).
  - **Current owners and dependencies:**
    [Ownership](docs/documentation.md#ownership).
  - **Accepted contracts and tracked gaps:**
    [Target behavior](docs/documentation.md#target-behavior).
  - **Deterministic coverage markers:**
    [Verification](docs/documentation.md#verification).
- **Contributor decisions:** [Contributing](docs/dev/contributing.md).
  - **Branches and commits:**
    [Git workflow](docs/dev/contributing.md#git-workflow).
  - **Supported runtimes:**
    [Runtime baseline](docs/dev/contributing.md#runtime-baseline).
  - **Compatibility defaults:**
    [Backward compatibility](docs/dev/contributing.md#backward-compatibility-pre-10).
  - **Tracked code comments:**
    [Code comments](docs/dev/contributing.md#code-comments).
- **Long-term product constraints:** [Project principles](docs/principles.md).
- **Runtime configuration:** [Configuration](docs/config.md).
  - **Port and origin derivation:**
    [Derivation rules](docs/config.md#derivation-rules).
- **Verification runtime:** [Test Harness](docs/specs/testing/test-harness.md).
- **Tracked repository follow-up:** [RemDo TODO](docs/todo.md#tracked-follow-up).
- **Local runtime procedures:**
  [Local Development](docs/dev/guides/local-development.md).
- **Specification evidence boundaries:**
  [Specification Feedback Cases](docs/specs/feedback-cases/README.md).
- **Task behavior:** its current owner under `docs/`.

Link current owners at first use when discussing repository work. A contract
migration moves the complete contract and fixes inbound links in the same
change. Do not add update-tracking sections to durable documents.

## Repository authority

- Inspect and edit within the requested scope without separate permission.
- Commit only when the user explicitly authorizes it or an invoked skill grants
  an autonomous commit scope. That authority includes staging only the
  authorized commit. Other staging or unstaging, stashing, resets, and index
  rewrites require an explicit user request. A plain change request grants
  neither commit nor push authority.
- Staged versus unstaged state does not signal completion, approval, protection,
  or task scope; edit files required by the task regardless of that state.
- Ordinary `git fetch` is allowed. Pulling, opening a pull request, and fetches
  with caller-supplied mutating refspecs require explicit user authority.
  Pushing always requires a separate explicit user request.
- Uncommitted work may be mid-transformation. A commit is coherent or tracks its
  precise remaining gap in [RemDo TODO](docs/todo.md#tracked-follow-up); when
  commit authority applies, record that gap without seeking separate approval.

## Isolation

- The developer owns background processes in the shared root workdir. Agents
  own the worktrees and worktree processes they create.
- Parallel work that can mutate runtime state uses an isolated worktree, data
  directory, and unique 100-port `PORT_BASE` block. Read-only work may share the
  coordinating agent's workdir. Keep worktrees outside the repository.
- Diagnose a stale service by process, command, port, and port block before
  restarting a process owned by the current workdir or worktree.
- Use `.agent/` for per-workdir scratch rather than versioned paths.

## Execution and evidence

- Stop on a missing task dependency. Investigate repository evidence before
  asking, and ask before choosing between unresolved material tradeoffs.
- Avoid speculative abstractions, compatibility shims, feature flags, and
  defensive guards that accepted behavior does not require.
- For bugs, reproduce the problem when practical, then verify the fix with the
  focused reproducer and applicable final checks.
- Tests protect observable behavior or a stable contract. Use end-to-end tests
  when unit coverage is a poor fit; do not substitute a manual check. Rely on an
  [empirical check](docs/documentation.md#empirical-checks) only when its owner
  classifies the behavior there, and perform it when the change can affect it.
- Review whether each changed behavior has meaningful automated or accepted
  empirical coverage, without treating line coverage as the target.
- For known fixtures, assume their documented shape; use non-null assertions
  rather than runtime guards unless validation is the behavior under test.
- Use live browser inspection as the primary evidence for UI behavior,
  rendering, interaction, and accessibility conclusions.
- The shared harness treats console warnings and errors as failures. Temporary
  instrumentation uses `console.log` or `console.info` and is removed before
  finishing.

## Review and handoff

- Land artifacts intended for developer review in the working directory rather
  than duplicating them in chat. Leave changes uncommitted unless commit
  authority applies.
- Before reporting code-review findings, check the repository
  [tracking record](docs/todo.md) and suppress findings it already covers. End
  with `Suppressed N finding(s) already tracked` when `N` is nonzero, and
  forward this rule to review subagents.
- Treat `docs/specs/feedback-cases/cases/**` as frozen outside an explicit
  request to create or refine a case. Explicit research may read them as
  evidence; routine work and review do not analyze or update them.
- Format multiple options or questions as a numbered list. Mark one option
  **(Recommended)** with its reason when evidence supports a preference.
- When a repo-local skill runs, report exactly one final `Local skills:` line:
  `clean` when no issue arose, otherwise concise issue or opportunity notes. Do
  not run a separate skill audit.

## Checks

Unless a narrower capability owns verification, determine the final gate in
this order:

1. `CODEX_CI=1` or `CI=true`: run `pnpm run check:full`.
2. A scope containing committed changes: run `pnpm run check:full`.
3. A wholly uncommitted local scope: run `pnpm run check`.

During iteration, prefer the narrowest applicable lint, typecheck, or test
command. Fix failures caused by the change or report them before handoff. Run a
full suite beyond the final gate only when requested or needed for diagnosis.
