---
name: remdo-simplify
description: The read-only code/test simplification finder that `remdo-refine` runs as its first rung; invoke directly only for an explicitly requested one-off simplify review (e.g. "run a simplify review", "what could be simpler here"). Reports code and test opportunities to make a selected diff's end state shorter, simpler, and cleaner, including limited redesign of directly related existing code when that reduces net complexity. Doc and skill-prose convergence belongs to `remdo-docs-align`. Does not edit files, stage, commit, or run mutating checks.
context: fork
agent: Explore
---

# RemDo Simplify (Claude Adapter)

Read and follow the shared RemDo simplify skill at
`../../../.agents/skills/remdo-simplify/SKILL.md`.

Claude Code runs this adapter in a fresh fork/explore context via the
frontmatter above. Keep all behavior, scope, and output rules in the shared
skill; this file exists only for Claude-specific discovery and isolation
metadata.
