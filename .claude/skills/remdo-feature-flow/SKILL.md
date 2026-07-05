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
below. The same trust covers tooling: when a referenced `superpowers:*` skill
is not installed, apply its discipline unaided rather than stalling on the
missing skill.

## Review surfaces

This skill runs on the WD-first review model from AGENTS.md ("Land artifacts for
review; don't paste them") — land artifacts, point at them, never double-read.
The two review surfaces are concrete versioned-repo content: the **`docs/`
changes** (phase 3) and the **report's diff index** (phase 5). Deferrals land in
`docs/todo.md`. `.agent/` is agent-only scratch, never a review surface.
Everything else is a thin chat pointer.

## Preflight — pin the design base

Run this first, **before the flow reads any code or docs**: fact verification,
dialog, and the spec must all be shaped against exactly the state the task
branch will fork from, or the design is built against one codebase while
Phase 3 branches from another.

**Tree clean of unrelated changes first.** Apply the Phase-3 "no unrelated
changes" judgment *before* running the script below — it fast-forwards a stale
branch, and a fast-forward would silently advance a checkout the run should have
stopped on. Pre-existing unrelated edits → stop. (The script itself refuses a
dirty tree, but it cannot tell this flow's own spec edits from unrelated work;
that judgment is yours.)

Then **run `sh tools/skills/preflight-base.sh`** (its header states the full
contract). It fetches, classifies the current branch against `origin/main`, and
either leaves it proceedable or exits for a state the run must stop on. Read its
outcome:

- **`STATE=even`** or **`STATE=behind`** (the latter after it fast-forwarded a
  merely-stale branch — safe: no rewrite, no merge commit, nothing lost) — the
  branch now matches `origin/main`. Take **`BASE=<sha>`** as the pinned fork
  point for this run and proceed. Phase 3 forks from *that pinned SHA*, not a
  re-fetched `origin/main`, so `origin/main` advancing mid-flow can't split the
  design base from the fork base.
- **Non-zero exit** (ahead, diverged, or dirty tree) — **stop.** The branch holds
  committed work not yet in `origin/main` (or has diverged), which the fork would
  not carry — a spec designed against it would vanish from the task branch. Ask
  the user to land it in `origin/main` first (merge the open `dev`→`main` PR) or
  to design from a checkout already at `origin/main`.

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

1. Read the relevant `docs/` and code **first**, before
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
the spec describes target behavior only (invariant #4), so the *why* lives there
until it moves into a `docs/` rationale or is dropped, rather than being
memory-carried.

## Phase 3 — Spec approval (the one user gate)

**Precondition — no unrelated changes in the tree.** The check is on what the run
did **not** produce: when the run started, were there pre-existing tracked edits
unrelated to this flow? If so, **stop** before the refine pass and branch
creation below — the working-tree refine would sweep them in, and committing or
branching could too. The user commits or sets them aside first (never do it for
them — see AGENTS.md). Everything this flow itself produced is fine and expected
— the spec docs written below, and any flow-owned `docs/todo.md` notes from
Phase 2 — so a normal clean-start run (where the only changes are this flow's)
passes this gate; it is not a requirement that "only spec edits" exist.

This gate assumes the **preflight base check ran** (see Preflight): it left the
current branch even with the pinned base SHA and recorded that SHA, which is what
lets the branch created below fork with no committed work lost and no stale design
base.

**The spec is the versioned-doc changes themselves**, written so the docs read as
if everything already works as described (per the `docs/` invariant: stable docs
describe *target* behavior). Edit the relevant docs under `docs/` — or add new
docs that clearly match the existing structure — to describe the design as the
new reality. Track any not-yet-built parts, gaps, or sequencing in `docs/todo.md`
(invariant 4, "Spec, not status"), not as caveats in the prose.

Comply with the documentation invariants
(`docs/documentation.md`) so static checks pass without rework, and
aim for a minimal, coherent, non-redundant end state even at the cost of larger
doc edits.

`.agent/specs/...` is **not** a review surface — it is your own scratch/cache for
talking to tools and subagents. Do not ask the user to review it.

**Refine the spec before handing it over.** Once the doc changes are written and
before presenting them, invoke the **`remdo-refine`** skill so the user reviews
already-converged prose, not a first draft:

- **Objective:** converge the uncommitted spec docs to a clean quality bar.
- **Scope passed:** working-tree scope (no branch exists yet — it is created on
  approval below); refine applies its fixes in place and commits nothing, so a
  later rejection still reverts the edits cleanly.
- **Report back:** refine's final index (fixes applied, tradeoffs pointed at
  `docs/todo.md`, checks). This flow does nothing further with it — the pass
  exists to land converged prose in the tree before the gate.

This gates only the final handoff: dialog (Phase 2) stays fast and unrefined, and
the pass runs once here at the gate, not per turn. The precondition above
guarantees the tree holds only this flow's own changes, so refine sees nothing
unrelated.

The user reviews the **`docs/` changes** (the chat message is a thin pointer:
which docs changed, plus a ~5-bullet approach summary — not the design pasted
inline). The user does **not** review a detailed plan. This is the only mandatory
user gate.

On approval, **create the task branch** (the commit-to-build point — dialog runs
on the current branch and no branch exists until here, so a dropped idea never
leaves a stray branch). The Phase-3 spec edits do live in the working tree on the
current branch, though: if the user rejects at the gate, **revert them** before
exiting — don't leave unapproved `docs/`/`docs/todo.md` changes behind.

Confirm the branch name/prefix (see "Branch naming") first, then **run `sh
tools/skills/create-task-branch.sh <name> <pinned-base-sha>`** with the SHA
pinned at preflight (its header states the full contract). It forks from the
pinned base carrying the uncommitted spec edits, and refuses any state that would
strand them; on a non-zero exit, resolve the drift it names and retry rather than
forcing the switch. The approved spec docs are then the branch's first commit
(the Phase-3 precondition above already ensured the tree holds only this flow's
changes). See "Branch base" for why the fork uses the pinned SHA.

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
3. **The loop's exit is an independent spec-compliance read, not
   self-assessment.** When the loop believes the spec's described state is
   reached, dispatch a **fresh subagent** to report divergences both ways:
   specified but not built, and built but not specified. Give it the spec (the
   branch's `docs/` changes — Phase 3's sense) and the branch diff
   (`origin/main...HEAD` plus any uncommitted work, untracked files included);
   it may read the rest of the repo for cross-checking (except `.agent/`, where
   the plan lives) but carries neither the plan nor this session's memory. The
   subagent only reports; acting on the report stays with you, inside the loop:
   fix real gaps (the loop continues), document or remove what is built but
   unspecified (the docs are the target reality), and record deliberate
   deferrals in `docs/todo.md` (invariant 4). The loop exits when this read
   comes back clean or fully tracked. For user-facing behavior, also verify the built behavior
   live per the AGENTS.md DevTools flow, with automated coverage per its e2e
   escalation rule — `superpowers:verification-before-completion` is the
   discipline for this exit step where available.
4. **Refine is part of done** — once the gap-closing loop reaches the spec's
   described state, **commit the phase-4 work** (refine and sync both need a clean
   tree). If `origin/main` has advanced since branch creation (cheap `git fetch`
   check), **suggest `remdo-sync`** next — now that the tree is clean it can run —
   so the eventual PR stays clean (non-blocking). Then invoke the
   **`remdo-refine`** skill:
   - **Objective:** converge the phase-4 work to a clean code-quality bar.
   - **Scope passed:** committed-range scope over this branch's own work
     (`origin/main...HEAD`); the tree is clean because the work was just
     committed, which is why refine's committed-range gate is satisfied.
   - **Report back:** refine's final index. It owns the quality loop (simplify →
     internal review → external Codex review, looping to a clean pass), the
     **tradeoff/blocker policy** for review findings, and the final checks for the
     current agent mode — all defined there, not restated here. Fold its tradeoffs
     (already in `docs/todo.md`) into the Phase-5 report.

   Refine converges *code quality*; reaching the spec's described state stays the
   gap-closing loop's job above.
5. **Mid-work decisions:** small blast radius (a later reversal would not waste
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
task branch for the user's `git diff "$(git merge-base origin/main HEAD)"` loop.
Thin chat summary:

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
- **Fast-forwarding the current branch to `origin/main`** as part of the
  preflight base check (performed by `tools/skills/preflight-base.sh`): allowed.
  The FF-only merge advances a *behind* branch along existing history — no
  rewrite, no merge commit, nothing lost — so it is safe autonomously; it fails
  (and thus never mutates) on a diverged branch, which the script handles as a
  stop. This is the one exception to the pull/merge line below.
- **Push / pull / opening PRs: never without the user's explicit ask.** The user
  owns the remote (and a general pull/merge, which can mutate or diverge the
  branch — unlike the scoped FF-only above).
- **Branch creation and cross-branch ops** (checkout-other, merge, rebase-onto,
  cherry-pick): require user confirmation.
- **Web read/search: allowed by default.**

The global index rules (staged-vs-unstaged invisible; no rearranging the index)
are unchanged here — see AGENTS.md, not repeated.

### Branch base: `origin/main...HEAD`

The single base for every diff, for both user and agent, is the **merge-base of
`origin/main` and `HEAD`**. Two forms, per what's being reviewed:

- **Committed range:** `git diff origin/main...HEAD` (three-dot diffs from the
  merge-base) — and `codex review --base origin/main` (safe as a one-shot; a
  looping `remdo-refine` pass anchors to a fixed base SHA instead, see that skill).
- **Working tree included** (committed + uncommitted — the mid-work review loop):
  `git diff "$(git merge-base origin/main HEAD)"`, plus
  `git ls-files --others --exclude-standard` for the untracked files that diff
  omits.

Always go through the merge-base: it is recomputed from the two refs every time,
so no base tag is stored and it cannot go stale — it shows exactly this branch's
own work even after a `remdo-sync` merge moves it forward. (A plain `git diff
origin/main` is *not* equivalent — once `origin/main` advances past the branch's
merge-base, it diffs against the wrong point.) **Default all mid-work and
end-of-work diff/review checks to this merge-base.**

**Creating the branch** (Phase 3) forks from the **base SHA pinned at
preflight** — the pin is what keeps the fork base equal to the design base. The
mechanics (the exact `git switch --merge` invocation and its staged-edit/drift
refusals) live in `tools/skills/create-task-branch.sh`; Phase 3 runs that script.
Preflight left the current branch at the pinned SHA, so only the **uncommitted
spec edits** carry across and the script's refusals are not expected to fire.

This flow forks task branches from `origin/main` only. Stacked/dependent branches
(forking off another in-progress branch) are out of scope — they would make
`origin/main...HEAD` include the parent's un-merged work. If you ever need one,
diff that branch by hand against its parent (`git diff <parent>...HEAD`,
`codex review --base <parent>`); no skill tracks it.

### Branch naming

Prefixes from `docs/contributing.md`: `feat/`, `fix/`, `refactor/`, `chore/`,
`docs/`. The base is `origin/main` per "Branch base" above; the user confirms the
name.

## Execution model (runtime decision)

Choose by the *activity*, not the phase number:

- **Dialog (phase 2): always inline** in the main session — it is a conversation;
  latency is felt in real time.
- **Autonomous execution (phase 4) and Research spikes: subagent-eligible** —
  your call by the independence test: dispatch subagents only for genuinely
  parallel, independent chunks (no shared state, no sequential dependency); stay
  inline otherwise. Deferred to runtime because the input (the actual dependency
  graph) does not exist until then. (A step that itself mandates a dispatch —
  the Phase-4 exit read — is outside this call.) Research spikes are
  subagent-eligible even
  when triggered from dialog, because the spike itself is autonomous work, not
  conversation.

## Out of scope (YAGNI)

- No sub-commands or flags — one entry; phases flow naturally.
- The coordinator runs in the shared WD, not a worktree. Worktree isolation for
  subagents follows AGENTS.md ("When to isolate") — not restated here.
- No speculative abstractions or shims (project is pre-1.0).

## References

- Sequenced skills: `superpowers:dispatching-parallel-agents`,
  `superpowers:using-git-worktrees`, `superpowers:verification-before-completion`.
- Phase-4 implementation discipline: `superpowers:test-driven-development`,
  `superpowers:systematic-debugging`.
- Phase-4 quality loop (simplify / internal review / external Codex review):
  `remdo-refine` skill.
- Bringing `origin/main` into the branch: `remdo-sync` skill.
- Integration after report (merge / PR): `superpowers:finishing-a-development-branch`.
- Preflight and branch-creation mechanics: `tools/skills/preflight-base.sh`,
  `tools/skills/create-task-branch.sh`.
- Documentation intent + invariants (spec-as-docs must comply):
  `docs/documentation.md`. Deferral/todo rules: `docs/todo.md`.
- Git workflow, the `origin/main...HEAD` diff contract, and branch prefixes:
  `docs/contributing.md#git-workflow`.
- Global commit/index defaults: `AGENTS.md` ("Safety & Process").
- Checks and timings: `AGENTS.md` ("Checks").
