---
name: remdo-feature-flow
description: Claude adapter for the RemDo feature-flow workflow. Use when starting a self-contained bigger change — a new feature or a redesign of something that does not exist yet — and the user wants to drive it from a vague idea to finished, reviewed, locally-committed work.
---

# RemDo Feature Flow (Claude Adapter)

Read and follow the shared RemDo feature-flow skill at
`../../../.agents/skills/remdo-feature-flow/SKILL.md`. The shared skill owns the
phase structure, branch/spec/commit policy, verification contract, and final
reporting. This adapter maps shared process intent to Claude-specific surfaces.

## Claude mappings

- **Test-first implementation:** use `superpowers:test-driven-development` when
  Phase 4 introduces new behavior that benefits from a red/green loop.
- **Unexpected failures:** use `superpowers:systematic-debugging` for bugs,
  failing checks, or confusing runtime behavior.
- **Verification exit discipline:** use `superpowers:verification-before-completion`
  where available, plus AGENTS.md DevTools/e2e requirements.
- **Parallel and spike work:** use `superpowers:dispatching-parallel-agents` and
  `superpowers:using-git-worktrees` where independent work or Research spikes
  should run outside the coordinating session.
- **Post-report integration:** `superpowers:finishing-a-development-branch` is
  the separate user-launched step for merge to `dev`, push, PR, or keep.
- **Cross-session notes:** concrete workflow improvements may go to
  `~/.claude/memory/` when they are agent-personal; stable repo workflow changes
  belong in the shared skill or repo docs.

Keep all task-branch permissions and push/PR restrictions from the shared skill.
