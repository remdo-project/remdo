# Agent instructions

RemDo's agent instructions provide the smallest always-loaded repository context
sufficient for a coding agent to work safely and locate the accepted behavior
governing its task.

## Instruction design

This section owns the research-informed criteria used to structure and maintain
RemDo's agent instructions. Changes in supported agent capabilities or
authoritative guidance trigger their reassessment.

### Surfaces

- `AGENTS.md` is the effective shared repository entry point. **Deterministic.**
- `AGENTS.override.md` is reserved for directory-scoped Codex rules below the
  repository root.
- Provider-specific entry points reuse the shared instructions and add only
  provider-specific rules.
- `CLAUDE.md` imports `AGENTS.md` exactly once as its first nonblank active
  content, before its Claude-specific rules. **Deterministic.**
- Every repository-controlled Codex instruction chain fits within Codex's
  documented default project-instruction limit. **Deterministic.**

### Admission and delegation

- Retain an always-loaded rule only when its absence could materially change
  routine repository work and no narrower owner can supply it in time.
- Put conditional or repeatable procedures in skills, deterministic constraints
  in tooling, and personal or machine-local preferences outside shared
  repository instructions. Retain a trigger and required result in the entry
  point only when agents need them before loading the narrower owner.
- Shared instructions state required outcomes without assuming
  provider-specific capabilities. Provider-specific instruction surfaces own
  their capability rules.
- Remove an instruction when its behavior becomes inferable, mechanically
  enforced, or superseded by a current owner.

## RemDo-specific content

This section owns repository routes and directly loaded rules required before
narrower owners can take over. Changes to repository owners, workflows, or
hazards update the applicable subsection.

### Routing

Agent instructions are a sparse router, not an index of repository
documentation. Route agents by the question they need to answer:

- **Durable documentation:** [Documentation](../../documentation.md).
  - **Owner categories:** [Layout](../../documentation.md#documentation-layout).
  - **Current owners and dependencies:** [Ownership](../../documentation.md#ownership).
  - **Accepted contracts and tracked gaps:** [Target behavior](../../documentation.md#target-behavior).
  - **Verification markers:** [Verification](../../documentation.md#verification).
- **Contributor decisions:** [Contributing](../../../CONTRIBUTING.md).
  - **Branches and commits:** [Git workflow](../../../CONTRIBUTING.md#git-workflow).
  - **Supported runtimes:** [Runtime baseline](../../../CONTRIBUTING.md#runtime-baseline).
  - **Cross-mode change impact:** [Run-Mode Impact](../../../CONTRIBUTING.md#run-mode-impact).
  - **Compatibility defaults:** [Backward compatibility](../../../CONTRIBUTING.md#backward-compatibility-pre-10).
  - **Tracked code comments:** [Code comments](../../../CONTRIBUTING.md#code-comments).
  - **Testing policy:** [Testing](../../dev/testing.md).
- **Long-term product constraints:** [Project principles](../../principles.md).
- **Supported run modes:** [Run Modes](../../run-modes.md).
  - **Production procedures:** [Production Deployment](../../guides/production-deployment.md).
  - **Development procedures:** [Local Development](../../guides/local-development.md).
  - **Verification procedures:** [Running Tests](../../guides/testing.md).
  - **Test runtime:** [Test Harness](../testing/test-harness.md).
- **Runtime configuration:** [Configuration](../runtime/configuration.md).
  - **Port and origin derivation:** [Derivation rules](../runtime/configuration.md#derivation-rules).
- **Tracked repository follow-up:** [RemDo TODO](../../todo.md#tracked-follow-up).
- **Specification evidence boundaries:** [Specification Feedback Cases](../feedback-cases/README.md).
- **Task behavior:** its current owner, located by filename and scope opener
  under `docs/`.

Link a document-level route when its whole contract applies. Nest a section
route beneath it only when an independently useful trigger needs that narrower
responsibility. State the subject or trigger that makes each route relevant. Do
not restate linked contracts.

### Direct rules

The shared entry point owns its directly loaded RemDo-specific rules. Those
rules cover the following responsibilities because agents need them before
narrower owners can take over.

#### Repository authority

The shared entry point owns [repository authority](../../../AGENTS.md#repository-authority),
including default edit authority, skill-declared mutations, and operations that
require explicit user authority.

#### Isolation

- The developer owns background processes in the shared root workdir. Agents
  own the worktrees and worktree processes they create.
- Parallel work that can mutate runtime state uses an isolated worktree, data
  directory, and 100-port block. Read-only work may share the coordinating
  agent's workdir.

#### Execution and verification

- Prefer the simplest permanent implementation. Stop on a missing task
  dependency, investigate repository evidence before asking, and ask before
  choosing between unresolved material tradeoffs.
- The shared entry point directs agents to add Markdown prose soft wraps only
  when required by line-length lint.
- Agents follow the contributor [testing policy](../../dev/testing.md) and
  report CI as pending until it runs.
- Agents perform each [empirical check](../../dev/testing.md#empirical-checks) required by an affected behavior's owner.
- Conclusions about UI behavior or rendering use live browser inspection as
  their primary evidence.

#### Review and handoff

- Review checks the repository [tracking record](../../todo.md) before reporting findings.
- Artifacts intended for developer review land in the working directory for
  inspection. Changes remain uncommitted unless commit authority applies.
- [Specification feedback cases](../feedback-cases/README.md) remain frozen
  evidence outside an explicit request to create or refine a case.

## References

- [OpenAI Codex: Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
  — instruction discovery, precedence, and project-document budget.
- [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/)
  — sparse repository maps and the maintenance cost of exhaustive instruction manuals.
- [Anthropic: Claude Code memory](https://code.claude.com/docs/en/memory)
  — shared-file imports, instruction loading, and concise authoring guidance.
- [GitHub Copilot: Response customization](https://docs.github.com/en/copilot/concepts/prompting/response-customization)
  — short, self-contained, non-conflicting repository instructions.
- [Gloaguen et al.: Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988)
  — controlled evidence on task cost, instruction relevance, and file length.
- [Lulla et al.: Impact of AGENTS.md on efficiency](https://arxiv.org/html/2601.20404)
  — empirical evidence on runtime and output-token efficiency.
