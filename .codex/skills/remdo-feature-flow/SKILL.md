---
name: remdo-feature-flow
description: Codex adapter for the RemDo feature-flow workflow. Use when starting a self-contained bigger RemDo change from vague idea to approved spec, implementation, review, and locally committed work.
---

# RemDo Feature Flow (Codex Adapter)

Read and follow the shared RemDo feature-flow skill at
`../../../.agents/skills/remdo-feature-flow/SKILL.md`. The shared skill owns the
phase structure, branch/spec/commit policy, verification contract, and final
reporting. This adapter maps shared process intent to Codex-specific surfaces.

## Codex mappings

- **Subagent authorization:** running `$remdo-feature-flow` authorizes Codex
  subagents for required fresh-context reads and for independent work where they
  are likely to materially help. If the user forbids subagents, stop or use a
  narrower non-feature-flow process rather than weakening required fresh-context
  reads.
- **Dialog:** stay inline in the coordinating Codex session.
- **Research and independent Phase-4 work:** use Codex subagents only for
  independent work with no shared mutable state; use worktrees and unique
  `PORT_BASE` blocks per AGENTS.md when a subagent runs tests or writes `data/`.
- **Spec-compliance exit read:** dispatch a fresh explorer/review subagent. Give
  it only the spec docs, branch diff scope, and AGENTS.md finding-suppression
  rule. Do not pass `.agent/` plans, implementation notes, suspected gaps, or
  prior conclusions.
- **Test-first and debugging discipline:** implement new behavior with focused
  failing coverage first when practical; for failures, reproduce and isolate
  before fixing. Use existing RemDo helpers and documented contracts before
  inventing new process.
- **Verification:** follow AGENTS.md local/cloud check rules, DevTools guidance
  for UI behavior, and e2e escalation for browser-observed behavior.
- **Quality loop:** call `remdo-refine`; its Codex adapter owns fresh-context
  simplify/internal-review and CodeRabbit/`codex review` external review.
- **Memory:** do not write Codex memory unless the user explicitly asks. Stable
  workflow improvements go into the shared skill or repo docs.

Keep all task-branch permissions and push/PR restrictions from the shared skill.
