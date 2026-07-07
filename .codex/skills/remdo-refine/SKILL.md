---
name: remdo-refine
description: Codex adapter for the RemDo autonomous quality loop over a diff on the current branch — simplify, docs-align where needed, internal review, and external review until a clean pass. Use when asked to refine a committed range or explicitly refine the uncommitted working tree.
---

# RemDo Refine (Codex Adapter)

Read and follow the shared RemDo refine skill at
`../../../.agents/skills/remdo-refine/SKILL.md`. This adapter only defines how
Codex maps the shared "fresh eyes" review requirements onto Codex surfaces.

## Fresh-context convention

For every shared-skill rung that requires fresh eyes, keep the coordinating
Codex session out of the review context:

1. **Simplify rung** — run `$remdo-simplify` in a fresh explorer/review subagent.
   Pass only the resolved scope argument (`<base-sha>..HEAD` or `working-tree`)
   and the `AGENTS.md` finding-suppression rule; do not pass implementation
   notes, suspected fixes, or prior conclusions.
2. **Internal-review rung** — use a fresh Codex review subagent or the closest
   Codex review-mode equivalent, again with scope only and no leading review
   angle.
3. **External-review rung** — use the first available non-coordinating reviewer
   from this ordered list:
   1. `coderabbit:code-review` / `coderabbit review --agent` when the CodeRabbit
      plugin is installed and authenticated. Committed-range scope uses
      `--base-commit <anchored-base-sha>`; working-tree scope uses
      `-t uncommitted`.
   2. `codex review` as a separate noninteractive process when CodeRabbit is not
      available. Committed-range scope uses `--base <anchored-base-sha>`;
      working-tree scope uses `--uncommitted`.
   If neither reviewer is available, stop and report the missing dependency
   rather than silently dropping the rung.

Running `$remdo-refine` authorizes Codex subagents for fresh-context rungs where
they are required or likely to materially help, including the simplify and
internal-review rungs above; do not ask again before dispatching them. If the
user explicitly forbids subagents, stop or use a narrower non-refine process
rather than replacing a required fresh-context rung with an inline review by the
coordinating session.

## Subagent prompt shape

Use a minimal prompt shape so the subagent rebuilds its own context:

```text
Use $remdo-simplify on scope <scope>. Read AGENTS.md first and apply its
findings-suppression rule. Return only the simplify report; do not edit files,
stage, commit, or run mutating checks.
```

For the internal-review rung, replace `$remdo-simplify` with the review task and
ask for correctness, quality, test, and regression findings over the same
resolved scope.
