# RemDo Agent Guidelines

RemDo is a keyboard-first collaborative outliner built on Lexical. Prefer the
simplest permanent implementation consistent with its accepted contracts.

## Routes

This is the shared repository entry point. Locate task-specific accepted
behavior by filename and scope opener under `docs/`, then read only the current
owner. Provider-specific surfaces may load it alongside their own rules.

- **Instruction design and surface responsibilities:** [Agent instructions](docs/specs/agents/instructions.md).
- **Durable documentation:** [Documentation](docs/documentation.md).
  - **Owner categories:** [Layout](docs/documentation.md#documentation-layout).
  - **Current owners and dependencies:** [Ownership](docs/documentation.md#ownership).
  - **Accepted contracts and tracked gaps:** [Target behavior](docs/documentation.md#target-behavior).
  - **Verification markers:** [Verification](docs/documentation.md#verification).
- **Contributor decisions:** [Contributing](CONTRIBUTING.md).
  - **Branches and commits:** [Git workflow](CONTRIBUTING.md#git-workflow).
  - **Supported runtimes:** [Runtime baseline](CONTRIBUTING.md#runtime-baseline).
  - **Cross-mode change impact:** [Run-Mode Impact](CONTRIBUTING.md#run-mode-impact).
  - **Compatibility defaults:** [Backward compatibility](CONTRIBUTING.md#backward-compatibility-pre-10).
  - **Tracked code comments:** [Code comments](CONTRIBUTING.md#code-comments).
  - **UI library default:** [UI Libraries](CONTRIBUTING.md#ui-libraries).
  - **Testing policy:** [Testing](docs/dev/testing.md).
- **Long-term product constraints:** [Project principles](docs/principles.md).
- **Supported run modes:** [Run Modes](docs/run-modes.md).
  - **Production procedures:** [Production Deployment](docs/guides/production-deployment.md).
  - **Development procedures:** [Local Development](docs/guides/local-development.md).
  - **Verification procedures:** [Running Tests](docs/guides/testing.md).
  - **Test runtime:** [Test Harness](docs/specs/testing/test-harness.md).
- **Runtime configuration:** [Configuration](docs/specs/runtime/configuration.md).
  - **Port and origin derivation:** [Network addressing](docs/specs/runtime/configuration.md#network-addressing).
- **Tracked repository follow-up:** [RemDo TODO](docs/todo.md#tracked-follow-up).
- **Task behavior:** its current owner under `docs/`.

Link current owners at first use when discussing repository work. A contract
migration moves the complete contract and fixes inbound links in the same
change. Do not add update-tracking sections to durable documents.

## Repository authority

- Inspect and edit within the requested scope without separate permission.
- Commit only when the user explicitly authorizes it or an invoked skill grants
  it in its specification; that authority includes staging only the authorized
  commit. A plain change request grants neither commit nor push authority.
- A skill specification may grant autonomous repository authority only by
  declaring its permitted effects, scope, and lifecycle.
  Undeclared staging or unstaging, branch or ref changes, stashing, resets, and
  index rewrites require an explicit user request.
- Staged versus unstaged state does not signal completion, approval, protection,
  or task scope; edit files required by the task regardless of that state.
- Ordinary `git fetch` is allowed. Pulling, rebasing, opening a pull request,
  and fetches with caller-supplied mutating refspecs require explicit user
  authority. Pushing always requires a separate explicit user request.
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
  asking.
- Resolve alternatives against applicable contracts and repository evidence.
  Choose a clearly preferred alternative within accepted behavior and authority
  as ordinary work. When no alternative is clearly preferred and multiple
  materially viable alternatives remain, choose and continue only if the choice
  stays within accepted behavior and authority and is readily reversible or
  otherwise bounded; retain the
  [decision](docs/specs/agents/protocol.md#decisions) for handoff. Otherwise stop
  before the choice and ask the developer, or return the unresolved choice as a
  [concern](docs/specs/agents/protocol.md#concerns) when acting as a capability.
- Include directly encountered adjacent cleanup when it is local,
  behavior-preserving, clearly correct from current owners, and more costly to
  rediscover or track separately than to fix now. Do not use this rule to
  expand the change into unrelated cleanup or unresolved design.
- Avoid speculative abstractions, compatibility shims, feature flags, and
  defensive guards that accepted behavior does not require.
- Do not add soft wraps to Markdown prose unless required by line-length lint.
- For bugs, reproduce the problem when practical, then verify the fix with the
  focused reproducer and applicable final checks.
- Apply the contributor [testing policy](docs/dev/testing.md) when selecting,
  writing, or reviewing coverage. Perform each [empirical check](docs/dev/testing.md#empirical-checks) required by an
  affected behavior's owner.
- Use live browser inspection as the primary evidence for UI behavior,
  rendering, interaction, and accessibility conclusions.
- The shared harness treats console warnings and errors as failures. Temporary
  instrumentation uses `console.log` or `console.info` and is removed before finishing.

## Review and handoff

- Land artifacts intended for developer review in the working directory rather
  than duplicating them in chat. Leave changes uncommitted unless commit
  authority applies.
- Before reporting code-review findings, check the repository
  [tracking record](docs/todo.md) and suppress findings it already covers. End
  with `Suppressed N finding(s) already tracked` when `N` is nonzero, and
  forward this rule to review subagents.
- Format multiple options or questions as a numbered list. Mark one option
  **(Recommended)** with its reason when evidence supports a preference.
- When a repo-local skill runs, report exactly one final `Local skills:` line:
  `clean` when no issue arose, otherwise concise issue or opportunity notes. Do
  not run a separate skill audit.

## Checks

Follow the contributor [testing policy](docs/dev/testing.md) and report CI as pending until it runs.

Fix failures caused by the change or report them before handoff.
