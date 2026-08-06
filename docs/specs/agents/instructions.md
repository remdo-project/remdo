# Agent instructions

RemDo's agent instructions provide the smallest always-loaded repository context
sufficient for a coding agent to work safely and locate the accepted behavior
governing its task.

## Instruction design

This section owns the research-informed criteria used to structure and maintain
RemDo's agent instructions. Changes in supported agent capabilities or
authoritative guidance trigger their reassessment.

### Surfaces

- `AGENTS.md` is the effective shared repository entry point.
  **Deterministic.**
- Provider-specific entry points reuse the shared instructions and add only
  provider-specific rules.
- `CLAUDE.md` imports `AGENTS.md` before its Claude-specific rules.
  **Deterministic.**
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
  - **Owner categories:**
    [Layout](../../documentation.md#documentation-layout).
  - **Current owners and dependencies:**
    [Ownership](../../documentation.md#ownership).
  - **Accepted contracts and tracked gaps:**
    [Target behavior](../../documentation.md#target-behavior).
  - **Deterministic coverage markers:**
    [Verification](../../documentation.md#verification).
- **Contributor decisions:** [Contributing](../../dev/contributing.md).
  - **Branches and commits:**
    [Git workflow](../../dev/contributing.md#git-workflow).
  - **Supported runtimes:**
    [Runtime baseline](../../dev/contributing.md#runtime-baseline).
  - **Compatibility defaults:**
    [Backward compatibility](../../dev/contributing.md#backward-compatibility-pre-10).
  - **Tracked code comments:**
    [Code comments](../../dev/contributing.md#code-comments).
- **Long-term product constraints:** [Project principles](../../principles.md).
- **Runtime configuration:** [Configuration](../../config.md).
  - **Port and origin derivation:**
    [Derivation rules](../../config.md#derivation-rules).
- **Verification runtime:** [Test Harness](../testing/test-harness.md).
- **Tracked repository follow-up:**
  [RemDo TODO](../../todo.md#tracked-follow-up).
- **Local runtime procedures:**
  [Local Development](../../dev/guides/local-development.md).
- **Specification evidence boundaries:**
  [Specification Feedback Cases](../feedback-cases/README.md).
- **Task behavior:** its current owner, located by filename and scope opener
  under `docs/`.

Link a document-level route when its whole contract applies. Nest a section
route beneath it only when an independently useful trigger needs that narrower
responsibility. State the subject or trigger that makes each route relevant. Do
not restate linked contracts.

### Direct rules

The shared entry point directly states RemDo-specific rules for:

- repository authority and Git mutation boundaries;
- shared-workspace, worktree, process, data, and port isolation;
- agent-mode detection, verification selection, and required check commands;
- review, tracked-finding, and handoff boundaries.

## References

These sources inform instruction design; they do not override this contract.

- [OpenAI Codex: Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
  — instruction discovery, precedence, and project-document budget.
- [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/)
  — sparse repository maps and the maintenance cost of exhaustive instruction
  manuals.
- [Anthropic: Claude Code memory](https://code.claude.com/docs/en/memory)
  — shared-file imports, instruction loading, and concise authoring guidance.
- [GitHub Copilot: Response customization](https://docs.github.com/en/copilot/concepts/prompting/response-customization)
  — short, self-contained, non-conflicting repository instructions.
- [Gloaguen et al.: Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988)
  — controlled evidence on task cost, instruction relevance, and file length.
- [Lulla et al.: Impact of AGENTS.md on efficiency](https://arxiv.org/html/2601.20404)
  — empirical evidence on runtime and output-token efficiency.
