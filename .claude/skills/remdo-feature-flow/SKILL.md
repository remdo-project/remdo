---
name: remdo-feature-flow
description: Use when starting a self-contained bigger change — a new feature or a redesign of something that does not exist yet — and the user wants to drive it from a vague idea to finished, reviewed, locally-committed work. Triggers include "let's design X", "I want to build/redesign X", "feature flow", or a vague drafted idea handed over for development. The user gates only on intent (the spec), not on a detailed plan; execution is autonomous, with the quality loop (via `remdo-refine`) baked into done.
---

# Feature Flow

## Overview

Drive a self-contained bigger change from a vague idea to finished, reviewed,
locally-committed work. This skill is a **conductor**: it sequences existing
skills (named per phase below and in `References`) and sets the autonomy policies
— it does not reimplement them.

The user reviews **intent**, not steps. The spec is the durable goal; the plan is
disposable. Execution converges on the spec autonomously; review, simplify, and
verify are part of "done," not user commands.

## Capability assumption (durable)

This skill follows the **Skill authoring** rule in `AGENTS.md`: assume every run
is performed by a model at least as capable as the current one, so it encodes
*intent* and keeps strictness to the reasonable minimum rather than baking in
assumptions a better future run would have to undo. That shapes every phase
below.

## Review surfaces

This skill runs on the WD-first review model from AGENTS.md ("Land artifacts for
review; don't paste them") — land artifacts, point at them, never double-read.
The two review surfaces are concrete versioned-repo content: the **`docs/`
changes** (phase 3) and the **report's diff index** (phase 5). Deferrals land in
`docs/todo.md`. `.agent/` is agent-only scratch, never a review surface.
Everything else is a thin chat pointer.

## Phase 1 — Draft (user)

The user states the vague idea: what they know, what they are unsure about. No
structure required. **Verify every fact the user asserts before building on it** —
never rely on an unchecked user claim. Record what you verified and the outcome
in the working artifact at `.agent/plans/<YYYY-MM-DD>-<feature>.md` (see Phase 4),
so the basis for the design survives beyond this session's memory rather than
being silently carried.

## Phase 2 — Dialog

Conversation plus cheap checks — inline, interactive, no subagents (latency the
user feels in real time).

1. Read the relevant `docs/` (via `docs/index.md`) and code **first**, before
   asking anything.
2. Ask only genuine residual questions, **batched** — not one at a time. The
   user reads slowly and dislikes redundancy.
3. **Default to local checks.** Anything answerable from code, app tools, or
   fixtures is just done — a local check or tool call is cheaper than asking and
   almost always better than guessing. Either party may call for a quick check
   when it is worth it.

Gather enough that autonomous implementation is realistic — neither flood the
user with maybe-needed questions nor stall on data a cheap check would settle.
When a question needs prior-art weight (recognized guidelines, established
patterns, how others solved it), **suggest** the **Research** capability below —
the user launches it; you do not start it on your own.

During dialog, ask whether the change is one concern or several — structural
splits (separate phases, separate specs, separate tasks) are cheap to make now
and expensive once code is written. Record the decisions dialog produces — the
split choice, and why a design was chosen over alternatives — in `docs/todo.md`:
the spec describes target behavior only (invariant #5), so the *why* lives there
until it moves into a `docs/` rationale or is dropped, rather than being
memory-carried.

## Phase 3 — Spec approval (the one user gate)

**The spec is the versioned-doc changes themselves**, written so the docs read as
if everything already works as described (per the `docs/` invariant: stable docs
describe *target* behavior). Edit the relevant docs under `docs/` — or add new
docs that clearly match the existing structure — to describe the design as the
new reality. Track any not-yet-built parts, gaps, or sequencing in `docs/todo.md`
(the "Target behavior only" invariant), not as caveats in the prose.

Comply with the documentation invariants
(`docs/contributing.md#documentation`) so static checks pass without rework, and
aim for a minimal, coherent, non-redundant end state even at the cost of larger
doc edits.

`.agent/specs/...` is **not** a review surface — it is your own scratch/cache for
talking to tools and subagents. Do not ask the user to review it.

The user reviews the **`docs/` changes** (the chat message is a thin pointer:
which docs changed, plus a ~5-bullet approach summary — not the design pasted
inline). The user does **not** review a detailed plan. This is the only mandatory
user gate.

On approval, **create the task branch** (the commit-to-build point — dialog and
the spec gate run on the current branch, so nothing is committed and no branch
exists until here; a dropped idea leaves nothing to clean up). Confirm branch
name/prefix (see "Branch naming") and create it per "Branch base" below. The
approved spec docs are the branch's first commit.

The tree must hold **only this flow's own changes** before that first commit —
if it had pre-existing unrelated edits when the run started, **stop**: committing
or branching could sweep them in, and refine later needs a clean tree. The user
commits, stashes, or sets them aside first.

## Phase 4 — Autonomous execution

1. Grow the **disposable working artifact** at
   `.agent/plans/<YYYY-MM-DD>-<feature>.md` (started in Phase 1 with the verified
   facts) into the detailed plan — your working memory and audit trail, **not** a
   user gate. Rewrite it freely as you learn.
2. Run the **gap-closing loop**: repeatedly ask *"what is the remaining distance
   to the spec's described state, and what is the next step that closes it?"* and
   take that step. The true goal is always the spec's described state, coherent
   with prior docs. Use the right process skill for each step as it warrants —
   `superpowers:test-driven-development` for new behavior,
   `superpowers:systematic-debugging` for a bug or unexpected failure — rather
   than writing ad hoc.
3. **Refine is part of done** — once the gap-closing loop reaches the spec's
   described state, **commit the phase-4 work** (refine and sync both need a clean
   tree; refine reviews the committed `wip-base..HEAD` range). If `origin/main` has
   advanced since branch creation (cheap `git fetch` check), **suggest `remdo-sync`**
   next — now that the tree is clean it can run — so refine reviews against current
   `main` and the eventual PR stays clean (non-blocking; sync may be gated). Then
   run the **`remdo-refine`** skill. It owns the quality loop (simplify → internal review → external Codex
   review, looping to a clean pass), the **tradeoff/blocker policy** for review
   findings (defined there, not restated here), and the final checks for the
   current agent mode at the end. Refine converges *code quality*; reaching the
   spec's described state stays the gap-closing loop's job above.
4. **Mid-work decisions:** small blast radius (a later reversal would not waste
   the work) → use judgment, **record it in `docs/todo.md`**, keep moving.
   Genuine large-blast-radius fork → stop, **recording the fork, the options, and
   what it blocks on in `docs/todo.md`** (not just chat) so the retro and any
   later session have the specifics. Stops are rare; a stop is **signal** for the
   retro (under-specified spec), never blame.

Deferrals, postponed decisions, and gaps go to `docs/todo.md` — not the dialog,
where both parties lose them from context. Follow that file's rules (mark `✅
Done` while a section is active; move durable decisions into the right `docs/`
file with a link). The user reviews `docs/todo.md` at final review, so reference
entries there rather than repeating them in chat.

Iterate until the spec's state is reached or a true blocker hits.

## Phase 5 — Report + retro

The report **indexes the diff**, it does not re-narrate it. The work is on the
task branch for the user's `git diff wip-base` loop. Thin chat summary:

1. What changed — pointing at files/areas, not prose-narrating each edit.
2. A pointer to the `docs/todo.md` entries added this run — tradeoffs taken
   (each is a deferral until a final decision is deliberately taken),
   deferrals, and decisions. Reference them; do not repeat them in chat.
3. Any blocker, with all data already gathered so unblocking is fast.
4. **Workflow retro:** what would make the next run smoother. Fold concrete,
   stable improvements back into this file; cross-session notes go to
   `~/.claude/memory/`.

The work is already committed (through refine) by this point; phase 5 is review,
not a commit step. Integration is the next, separate step the user launches —
`superpowers:finishing-a-development-branch` (merge to `dev` / push + open PR /
keep), with push and PR still gated on the user's explicit ask.

## Research (optional capability)

Heavyweight investigation that validates the **so-far-agreed** design against
recognized guidelines, established patterns, and prior art (projects that solved a
similar problem — to reuse or just learn from). Not a fixed phase: it is a
capability the **dialog** phase suggests and the **execution** phase may
self-launch when a question needs prior-art weight (see "Launch differs by
phase").

- **Launch differs by phase.** In **dialog**, *suggest* it in one short line and
  let the user launch it — they are present, and it is heavyweight
  (token-intensive, possibly spawning worktree spikes), so propose-and-wait
  avoids surprising them mid-conversation. In **autonomous execution**, it is at
  your full disposal: self-launch whenever it disambiguates a problem; there is
  no point stalling the gap-closing loop to wait for a manual launch. Either way
  the user reads the synthesis, not the sources.
- **Bounded by a question, not by exhaustiveness.** Start only when there is a
  specific thing to validate (e.g. "does our access model match AIP-XXX?", "how
  do mature outliners handle Y?"). Stop when that question is answered and the
  design has its backing — not when sources run out. Open-ended "gather
  everything" is the failure mode to avoid.
- **Spikes** (throwaway prototypes to gather data) may run in parallel via
  `superpowers:dispatching-parallel-agents`, isolated in worktrees via
  `superpowers:using-git-worktrees` (per AGENTS.md worktree/`PORT_BASE` rules).
  Spikes are throwaway — keep findings, discard the code.
- **Output:** fold well-fitted sources as **citations into the design/spec** so
  it is evidence-backed. Prefer established patterns and ready-made recognized
  tools over ad-hoc invention; redesigning existing code to match a recognized
  pattern/tool is in scope.

## Permissions (scoped to this skill)

The global AGENTS.md default ("never commit unless told") stays in force
everywhere else; invoking this skill is the explicit authorization to commit on
a task branch. Within a run:

- **Local commits on a confirmed task branch: allowed.** Never directly onto
  `dev` or `main`.
- **`git fetch`: always allowed** — it only updates remote-tracking refs, never
  your work or the remote.
- **Push / pull / opening PRs: never without the user's explicit ask.** The user
  owns the remote (and pull, which mutates the branch).
- **Branch creation and cross-branch ops** (checkout-other, merge, rebase-onto,
  cherry-pick): require user confirmation.
- **Web read/search: allowed by default.**

The global index rules (staged-vs-unstaged invisible; no rearranging the index)
are unchanged here — see AGENTS.md, not repeated.

### Commit timing

Committing phase-4 work before refine (Phase 4) does not change the review
surface: `git diff wip-base` shows committed and uncommitted work alike. Commit
on the task branch only; never push without the user's explicit ask.

### Branch base: the `wip-base` tag

A local tag **`wip-base`** marks the start of work — the single base for every
diff, for both user and agent (`git diff wip-base..HEAD`, `git diff wip-base`).
**Default all mid-work and end-of-work diff/review checks to `wip-base`.**

**Creating the branch** (Phase 3) forks from the *published* state of the current
branch, so the new branch starts clean and merges back easily later:

1. `git fetch` (unconditional — fetch is always allowed).
2. If `origin/<current-branch>` does not exist → **stop and ask** what to fork
   from (don't guess a base for an unpushed branch).
3. If local `<current-branch>` is **ahead** of `origin/<current-branch>` (unpushed
   commits) → **stop**: those commits would be left out of the new branch and
   could be forgotten. The user pushes or handles them first.
4. Otherwise create the branch off `origin/<current-branch>` and anchor
   `wip-base` there (its tip is the fork point). If that base is behind or
   diverged from `origin/main`, **warn but proceed** (non-blocking) — forking off
   an in-progress branch is fine; `remdo-sync` handles catching up later.

Forking off an in-progress feature branch works as-is: the new branch starts at
that feature's published tip, so `wip-base..HEAD` is only the new branch's own
work. The invariant `wip-base..HEAD` = the branch's own work is what `remdo-sync`
preserves when it later moves `wip-base`. Setting or moving the tag is authorized
only as part of these flows (this skill at creation, `remdo-sync` after a merge);
never move it ad hoc, out of band.

### Branch naming

Prefixes from `docs/contributing.md`: `feat/`, `fix/`, `refactor/`, `chore/`,
`docs/`. The base is the published current branch per "Branch base" above; the
user confirms the name.

## Execution model (runtime decision)

Choose by the *activity*, not the phase number:

- **Dialog (phase 2): always inline** in the main session — it is a conversation;
  latency is felt in real time.
- **Autonomous execution (phase 4) and Research spikes: subagent-eligible** —
  your call by the independence test: dispatch subagents only for genuinely
  parallel, independent chunks (no shared state, no sequential dependency); stay
  inline otherwise. Deferred to runtime because the input (the actual dependency
  graph) does not exist until then. Research spikes are subagent-eligible even
  when triggered from dialog, because the spike itself is autonomous work, not
  conversation.

## Out of scope (YAGNI)

- No sub-commands or flags — one entry; phases flow naturally.
- The coordinator runs in the shared WD, not a worktree. Worktree isolation for
  subagents follows AGENTS.md ("When to isolate") — not restated here.
- No speculative abstractions or shims (project is pre-1.0).

## References

- Sequenced skills: `superpowers:brainstorming`,
  `superpowers:dispatching-parallel-agents`, `superpowers:using-git-worktrees`,
  `superpowers:verification-before-completion`.
- Phase-4 implementation discipline: `superpowers:test-driven-development`,
  `superpowers:systematic-debugging`.
- Phase-4 quality loop (simplify / internal review / external Codex review):
  `remdo-refine` skill.
- Keeping `wip-base` current against `origin/main`: `remdo-sync` skill.
- Integration after report (merge / PR): `superpowers:finishing-a-development-branch`.
- Doc map (navigation): `docs/index.md`. Doc workflow + invariants (spec-as-docs
  must comply): `docs/contributing.md#documentation`. Deferral/todo rules:
  `docs/todo.md`.
- Git workflow / branch prefixes: `docs/contributing.md`.
- Global commit/index defaults: `AGENTS.md` ("Safety & Process").
- Checks and timings: `AGENTS.md` ("Checks").
