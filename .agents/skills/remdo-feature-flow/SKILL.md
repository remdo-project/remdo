---
name: remdo-feature-flow
description: Use when starting a self-contained bigger RemDo change — a new feature or a redesign of something that does not exist yet — and the user wants to drive it from a vague idea to finished, reviewed, locally-committed work. Triggers include "let's design X", "I want to build/redesign X", "feature flow", or a vague drafted idea handed over for development. The user gates only on intent (the spec), not on a detailed plan; execution is autonomous, with the quality loop via `remdo-refine` baked into done.
---

# Feature Flow

## Overview

Drive a self-contained bigger change from a vague idea to finished, reviewed,
locally-committed work. This skill is a conductor: it sequences existing skills,
sets the autonomy policy, and keeps the run grounded in versioned docs. It does
not reimplement the skills it calls.

The user reviews **intent**, not steps. The spec is the durable goal; the plan is
disposable. Execution converges on the spec autonomously; review, simplify, and
verify are part of done.

The two review surfaces are concrete versioned-repo content: the **`docs/`
changes** in Phase 3 and the **report's diff index** in Phase 5. Deferrals land
in `docs/todo.md`. `.agent/` is agent-only scratch, never a user review surface.

## Preflight — pin the design base

Run this first, before the flow reads code or docs: fact verification, dialog,
and the spec must all be shaped against exactly the state the task branch will
fork from.

Run `sh .agents/skills/remdo-feature-flow/tools/preflight-base.sh`. Its header
states the full contract. It leaves the branch proceedable or exits for a state
the run must stop on:

- **Proceedable** (`STATE=even`/`behind`) — take `BASE=<sha>` as the pinned fork
  point and proceed. Phase 3 forks from that pinned SHA, not a re-fetched
  `origin/main`.
- **Non-zero exit** — stop, read stderr, and act on why:
  - **Dirty tree** — resolve it locally by judgment, then rerun.
  - **Ahead / diverged** — the branch holds committed work the fork would not
    carry. Ask the user to land it in `origin/main` first or to design from a
    checkout already at `origin/main`.

## Phase 1 — Draft

The user states the vague idea: what they know, what they are unsure about. No
structure is required. Verify every fact the user asserts before building on it.
Record verified facts and outcomes in `.agent/plans/<YYYY-MM-DD>-<feature>.md`
so the design basis survives beyond session memory.

## Phase 2 — Dialog

Conversation plus cheap checks, inline and interactive.

1. Read relevant `docs/` and code before asking.
2. Ask only genuine residual questions, batched rather than one at a time.
3. Default to local checks for anything answerable from code, docs, app tools,
   fixtures, or the browser.

Gather enough that autonomous implementation is realistic. When a question
needs prior-art weight, suggest the Research capability below; the user launches
it during dialog. Ask whether the change is one concern or several, and record
split decisions and design tradeoffs in `docs/todo.md`.

## Phase 3 — Spec approval

**Precondition — no unrelated changes in the tree.** If there were pre-existing
tracked edits unrelated to this flow, stop before the refine pass and branch
creation. The user commits or sets them aside first. Flow-owned spec docs and
flow-owned `docs/todo.md` notes are expected.

The spec is the versioned-doc changes themselves, written so the docs read as if
the target behavior already works. Edit the relevant docs under `docs/`, or add
new docs that match the existing structure. Track not-yet-built parts, gaps, and
sequencing in `docs/todo.md`, not as caveats in stable prose. Follow
`docs/documentation.md`.

Before presenting the docs, invoke `remdo-refine` in working-tree scope:

- **Objective:** converge the uncommitted spec docs to a clean quality bar.
- **Scope passed:** `working-tree`.
- **Result handling:** refine applies fixes in place and commits nothing; report
  its final index with the spec handoff.

The user reviews the `docs/` changes, with chat as a thin pointer: changed docs
plus a short approach summary. This is the only mandatory user gate.

On approval, confirm the branch name/prefix, then run:

```sh
sh .agents/skills/remdo-feature-flow/tools/create-task-branch.sh <name> <pinned-base-sha>
```

The script forks from the pinned base carrying the approved uncommitted spec
edits. On a non-zero exit, resolve the drift it names and retry. The approved
spec docs are then the task branch's first commit.

If the user rejects the spec at the gate, revert the flow-owned `docs/` and
`docs/todo.md` changes before exiting.

## Phase 4 — Autonomous execution

1. Grow `.agent/plans/<YYYY-MM-DD>-<feature>.md` into the detailed working plan.
2. Run the gap-closing loop: repeatedly ask what remains between the branch and
   the spec's described state, then take the next step that closes it. For new
   behavior, prefer test-first implementation. For bugs or unexpected failures,
   reproduce, isolate, fix, and verify rather than guessing. Prefer existing
   RemDo helpers and proven libraries over ad-hoc invention.
3. When the loop believes the spec is reached, get a fresh spec-compliance read:
   compare the branch's `docs/` changes and branch diff both ways, specified but
   not built and built but not specified. The reviewer reads the repo as needed
   but not `.agent/`, and receives neither the plan nor implementation memory.
   In Codex, dispatch this as a fresh explorer/review subagent and pass only the
   spec docs, branch diff scope, and the `AGENTS.md` findings-suppression rule.
   The reviewer reports only; the coordinating agent fixes real gaps, documents
   or removes unspecified behavior, and records deliberate deferrals in
   `docs/todo.md`.
4. For user-facing behavior, verify live per AGENTS.md DevTools guidance and add
   automated coverage per its e2e escalation rule.
5. Once the spec is reached, commit the Phase-4 work. If `origin/main` advanced
   since branch creation, suggest `remdo-sync` after the tree is clean. Then run
   `remdo-refine` in committed-range scope over this branch's own work
   (`origin/main...HEAD`). Refine owns the quality loop, final checks, and
   review-finding tradeoff policy.
6. For mid-work decisions, use judgment for small blast-radius choices and record
   them in `docs/todo.md`. Stop only for genuine large-blast-radius forks, also
   recording the fork, options, and blocker in `docs/todo.md`.

Iterate until the spec's state is reached or a true blocker hits.

## Phase 5 — Report + retro

The report indexes the diff, not re-narrates it:

1. What changed, pointing at files/areas.
2. `docs/todo.md` entries added or resolved.
3. Any blocker, with gathered data.
4. Workflow retro: stable improvements go into this shared skill or relevant
   docs (see the Execution model's Memory rule for the agent-memory gate).

The work is already committed through the flow/refine by this point. Integration
after the report, including merge to `dev`, push, or PR creation, is a separate
step that still needs the user's explicit ask.

## Research capability

Use Research for heavyweight investigation that validates the so-far-agreed
design against recognized guidelines, established patterns, and prior art.

- In dialog, suggest Research and let the user launch it.
- In autonomous execution, self-launch Research when it disambiguates a problem.
- Bound Research by a concrete question, not by exhaustiveness.
- Spikes may run in parallel when independent, isolated according to AGENTS.md
  worktree and `PORT_BASE` rules. Keep findings and discard spike code.
- Fold well-fitted sources as citations into the design/spec.

## Permissions

Invoking this skill is an explicitly declared autonomous scope (per AGENTS.md):
authorization to create and commit on a confirmed task branch. Within a run:

- **Local commits on a confirmed task branch: allowed.** Never commit directly
  onto `dev` or `main`.
- **Fast-forwarding the current branch to `origin/main`** as part of
  `preflight-base.sh`: allowed. The FF-only merge advances a behind branch along
  existing history and fails on diverged branches.
- **Push / pull / opening PRs: never without the user's explicit ask.**
- **Branch creation and cross-branch ops** require user confirmation, except the
  approved task-branch creation step above.
- **Web read/search: allowed by default.**

## Branch base

The single base for every diff is the merge-base of `origin/main` and `HEAD`.

- **Committed range:** `git diff origin/main...HEAD`.
- **Working tree included:** `git diff "$(git merge-base origin/main HEAD)"`,
  plus `git ls-files --others --exclude-standard`.

Creating the branch forks from the base SHA pinned at preflight. This flow forks
task branches from `origin/main` only; stacked/dependent branches are out of
scope and must be handled by hand.

Branch prefixes come from `docs/contributing.md`: `feat/`, `fix/`, `refactor/`,
`chore/`, `docs/`. The user confirms the branch name.

## Execution model

Choose by activity:

- **Dialog:** inline in the main session.
- **Autonomous execution and Research spikes:** subagent-eligible when work is
  genuinely parallel and independent; otherwise stay inline.
- **Spec-compliance exit read:** must be fresh-context, through the current
  agent's adapter. If the user forbids subagents and the runtime has no
  equivalent isolated review surface, stop or use a narrower non-feature-flow
  process rather than weakening the fresh-context read.
- **Memory:** do not write agent memory unless the user explicitly asks (the
  Phase 5 retro owns where stable improvements land instead).

## References

- Phase-4 quality loop: `remdo-refine` skill.
- Syncing `origin/main`: `remdo-sync` skill.
- Preflight and branch creation:
  `.agents/skills/remdo-feature-flow/tools/preflight-base.sh`,
  `.agents/skills/remdo-feature-flow/tools/create-task-branch.sh`.
- Documentation intent and invariants: `docs/documentation.md`; deferral rules:
  `docs/todo.md`.
- Git workflow and branch prefixes: `docs/contributing.md#git-workflow`.
- Global commit/index defaults, worktree isolation, DevTools checks, and final
  checks: `AGENTS.md`.
