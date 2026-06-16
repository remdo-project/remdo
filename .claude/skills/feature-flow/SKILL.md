---
name: feature-flow
description: Use when starting a self-contained bigger change — a new feature or a redesign of something that does not exist yet — and the user wants to drive it from a vague idea to finished, reviewed, locally-committed work. Triggers include "let's design X", "I want to build/redesign X", "feature flow", or a vague drafted idea handed over for development. The user gates only on intent (the spec), not on a detailed plan; execution is autonomous with review/simplify/verify baked into done.
---

# Feature Flow

## Overview

Drive a self-contained bigger change through five phases: draft → dialog → spec
approval → autonomous execution → report+retro, plus **Research** — an optional
heavyweight capability the dialog and execution phases can invoke when a question
needs prior-art weight. This skill is a **conductor** — it sequences existing
skills (`superpowers:brainstorming`, `superpowers:writing-plans`,
`superpowers:dispatching-parallel-agents`, `superpowers:using-git-worktrees`,
`superpowers:requesting-code-review`, `/simplify`,
`superpowers:verification-before-completion`, `/code-review`) and sets the
autonomy policies below. It does not reimplement them.

The user reviews **intent**, not steps. The spec is the durable goal; the plan is
disposable. Execution converges on the spec autonomously; review, simplify, and
verify are part of "done," not user commands.

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
never rely on an unchecked user claim.

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
and expensive once code is written.

## Phase 3 — Spec approval (the one user gate)

**The spec is the versioned-doc changes themselves**, written so the docs read as
if everything already works as described (per the `docs/` invariant: stable docs
describe *target* behavior). Edit the relevant docs under `docs/` — or add new
docs that clearly match the existing structure — to describe the design as the
new reality. Track any not-yet-built parts, gaps, or sequencing in `docs/todo.md`
(invariants 5–6), not as caveats in the prose.

Comply with the existing doc governance so static checks and `docs/index.md`
rules are satisfied (no wasted rework): single source per topic, top-down
linking, self-contained behavior with external refs in a final `References`
section, and **refresh the `docs/index.md` map for any doc edited** — except the
`docs/todo.md` summary, which stays as-is. Aim for a minimal, coherent,
non-redundant end state, even at the cost of larger doc edits.

`.agent/specs/...` is **not** a review surface — it is your own scratch/cache for
talking to tools and subagents. Do not ask the user to review it.

The user reviews the **`docs/` changes** (the chat message is a thin pointer:
which docs changed, plus a ~5-bullet approach summary — not the design pasted
inline). The user does **not** review a detailed plan. This is the only mandatory
user gate.

## Phase 4 — Autonomous execution

1. Write the **detailed plan as a disposable working artifact** at
   `.agent/plans/<YYYY-MM-DD>-<feature>.md` — your working memory and audit
   trail, **not** a user gate. Rewrite it freely as you learn.
2. Run the **gap-closing loop**: repeatedly ask *"what is the remaining distance
   to the spec's described state, and what is the next step that closes it?"* and
   take that step. The true goal is always the spec's described state, coherent
   with prior docs.
3. **Review / simplify / verify are part of done** — run automatically, then
   iterate on findings:
   - `superpowers:requesting-code-review` or `/code-review` at high effort,
     diffing against `wip-base` (see "Branch base");
   - `/simplify`;
   - the local-agent final checks: `pnpm run lint`; `pnpm run test:unit` for
     behavior/code changes; `pnpm run test:collab` when collaboration risk
     exists (see AGENTS.md "Checks").
   Fix what is safe and behavior-preserving; **defer tradeoffs to
   `docs/todo.md`** (non-blocking).
4. **Mid-work decisions:** small blast radius (a later reversal would not waste
   the work) → use judgment, **record it in `docs/todo.md`**, keep moving.
   Genuine large-blast-radius fork → stop. Stops are rare; a stop is **signal**
   for the retro (under-specified spec), never blame.

Deferrals, postponed decisions, and gaps go to `docs/todo.md` — not the dialog,
where both parties lose them from context. Follow that file's rules (mark `✅
Done` while a section is active; move durable decisions into the right `docs/`
file with a link). The user reviews `docs/todo.md` at final review, so reference
entries there rather than repeating them in chat.

Iterate until the spec's state is reached or a true blocker hits.

## Phase 5 — Report + retro

The report **indexes the diff**, it does not re-narrate it. Changes sit in the
WD (uncommitted by default; see "Commit timing") for the user's `git diff` loop.
Thin chat summary:

1. What changed — pointing at files/areas, not prose-narrating each edit.
2. Tradeoffs taken (and why).
3. A pointer to the `docs/todo.md` entries added this run (deferrals/decisions) —
   reference, do not repeat them.
4. Any blocker, with all data already gathered so unblocking is fast.
5. **Workflow retro:** what would make the next run smoother. Fold concrete,
   stable improvements back into this file; cross-session notes go to
   `~/.claude/memory/`.

After the user reviews the diff, commit per "Commit timing."

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
- **Push / pull / mutating fetch / opening PRs: never without the user's
  explicit ask.** The user owns the remote.
- **Branch creation and cross-branch ops** (checkout-other, merge, rebase-onto,
  cherry-pick): require user confirmation.
- **Web read/search: allowed by default.**

The global index rules (staged-vs-unstaged invisible; no rearranging the index)
are unchanged here — see AGENTS.md, not repeated.

### Commit timing

Work stays **uncommitted by default** during phase 4 — the working tree is the
user's review surface. Commit **with or after the user's nod at phase 5**.
Exception: if a run is long enough that losing uncommitted work would hurt,
commit at natural safe-points during the run (still on the confirmed task
branch).

### Branch base: the `wip-base` tag

A local tag **`wip-base`** marks the start of work. It is the single base for
every diff, for both user and agent — `git diff wip-base..HEAD` (history),
`git diff wip-base` (with uncommitted tree). **Default all mid-work and end-of-
work diff/review checks to `wip-base`.**

At branch creation, place the tag at the branch's **real fork point**:

```sh
CUR=$(git branch --show-current); HEADC=$(git rev-parse HEAD); BASE=""
for ref in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vx "$CUR"); do
  mb=$(git merge-base HEAD "$ref") || continue
  [ "$mb" = "$HEADC" ] && continue
  if [ -z "$BASE" ] || git merge-base --is-ancestor "$BASE" "$mb"; then BASE=$mb; fi
done
: "${BASE:=$(git merge-base origin/main HEAD)}"
git tag -f wip-base "$BASE"   # only with user confirmation — see movement rule
```

Baseline is **`origin/main`**, not local `main` (which lags). Recording the actual
parent keeps branching off ahead-of-baseline work (e.g. `dev`) from flooding
reviews with unrelated commits. Same fork-detection as `remdo-sweep`, retargeted
to `origin/main`. `origin/main` is only as fresh as the last fetch and the user
owns pull — do **not** fetch silently; if it looks stale or
`git rev-parse origin/main` errors, ask the user to fetch before placing the tag.

**Movement rule (safety-critical — a local tag has no remote safety rail).**
`wip-base` is created or moved **only with the user's confirmation** — this
includes re-pointing it at a new task's start and re-anchoring after a rebase
shifts the fork point. The agent never moves it silently. If the base
legitimately changes, propose the move and wait for the nod; until then, keep
diffing against the existing tag.

### Branch naming

Prefixes from `docs/contributing.md`: `feat/`, `fix/`, `refactor/`, `chore/`,
`docs/`. Default to an `origin/main`-based branch; the user confirms branch
creation and may redirect to current `HEAD` when building on in-progress work.

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
- No worktree-by-default — worktree isolation is an opt-in for high-risk tasks.
- No speculative abstractions or shims (project is pre-1.0).

## References

- Sequenced skills: `superpowers:brainstorming`, `superpowers:writing-plans`,
  `superpowers:executing-plans`, `superpowers:dispatching-parallel-agents`,
  `superpowers:using-git-worktrees`, `superpowers:requesting-code-review`,
  `superpowers:verification-before-completion`, `/simplify`, `/code-review`.
- Fork-point detection: `.codex/skills/remdo-sweep/SKILL.md`.
- Doc governance (map, workflow, invariants — spec-as-docs must comply):
  `docs/index.md`. Deferral/todo rules: `docs/todo.md`.
- Git workflow / branch prefixes: `docs/contributing.md`.
- Global commit/index defaults: `AGENTS.md` ("Safety & Process").
- Checks and timings: `AGENTS.md` ("Checks").
