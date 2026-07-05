---
name: remdo-simplify
description: The read-only simplification finder that `remdo-refine` runs as its first rung; invoke directly only for an explicitly requested one-off simplify review (e.g. "run a simplify review", "what could be simpler here"). Reports code, test, and documentation opportunities to make a selected diff's end state shorter, simpler, and cleaner, including limited redesign of directly related existing code when that reduces net complexity. Does not edit files, stage, commit, or run mutating checks.
context: fork
agent: Explore
---

# RemDo Simplify

## Intent

Report simplification opportunities for a RemDo change. This is a review-style
pass: do not edit files, stage, commit, or run checks that intentionally write
repo state. Ask whether the changed end state could be shorter, simpler, or
cleaner if the touched code, tests, docs, or directly related supporting code
were shaped differently.

Prefer findings that let the author delete code, reuse an existing RemDo,
Lexical, or platform primitive, move behavior to its owning layer, reduce special
cases, or cut/rehome prose that violates the RemDo documentation invariants.
Avoid speculative architecture and personal style preferences.

The pass is intentionally read-only so it can serve as an independent
simplification finder — for a `remdo-refine`-style quality loop, or run standalone
before an editing pass. The frontmatter's `context: fork` + `agent: Explore`
(Claude Code) runs it in a fresh, edit-tool-free context, so the review never
inherits the caller's implementation memory; a runtime that ignores those keys
should be given the same isolation by the caller (a fresh subagent).

## Non-goals

- Do not apply fixes.
- Do not broaden feature scope or design new product behavior.
- Do not run a general correctness, security, or performance review unless the
  issue is also a simplification opportunity.

## Select the scope

Use the exact scope supplied by the caller. A refine caller should pass only the
scope and this skill, not its suspected fixes or implementation context.

Resolve it by running `sh tools/skills/resolve-scope.sh [scope]` (its header
states the full contract): no argument for the committed-range default (this
branch's own work), or `working-tree` for the uncommitted changes. It prints
`SCOPE=`/`BASE=` plus the file list. This pass is read-only and never loops, so it
needs no anchoring of its own — reusing the resolver just keeps one scope contract
across the skills. On a non-zero exit, warn and stop rather than folding the other
side's changes into the review; on an integration branch (`dev`) where the
committed default is not one unit of work, report that an explicit scope is
required.

For the resolved scope, run this read-only inspection to read the diff surface:

```sh
git diff --stat <range>
git diff --name-status <range>
git diff --check <range>
```

`<range>` is the committed range's base (`<base-sha>..HEAD`) in committed-range
scope and `HEAD` (the working-tree diff) in working-tree scope, so every command
targets exactly the scope's diff and never folds in the other side. Read the diff
per file when the total diff is large. Read untracked files that belong to the
scope (from the resolver's file list).

## Read RemDo guidance

Read these first:

1. `AGENTS.md`
2. `docs/contributing.md`
3. `docs/todo.md`

Choose directly relevant product docs for the touched area by filename and
scope opener. Do not reread unrelated docs.

Forward the `AGENTS.md` findings-suppression rule into this pass. The `Suppressed
N` tail it requires is shown in the Output template below.

For editor-related decisions, prefer RemDo's current Lexical patterns and, when
the dependency tree is available, inspect `node_modules/lexical/src/` before
suggesting a custom abstraction or workaround.

## Inspect related sources

Start from the diff, then read enough surrounding code to judge whether a
simpler end state exists:

- Whole touched files when a hunk is not self-contained.
- Tests and fixtures that define the changed behavior.
- Existing helpers, adapters, hooks, commands, and feature modules the diff uses
  or duplicates.
- Direct callers/callees where the diff's API shape forces complexity on either
  side.
- Directly relevant docs for the touched area.

This is not a broad repo sweep. Follow references as far as needed for a credible
simplification finding, but stop when the connection to the reviewed diff becomes
speculative.

Potential redesign of untouched code is in scope only when all are true:

1. The reviewed diff depends on that code, duplicates it, works around it, or
   would become simpler if that existing boundary were reshaped.
2. The redesign is behavior-preserving relative to the task/spec.
3. The net end state is smaller or conceptually simpler after counting the
   companion change.
4. The recommendation can name the owning layer/file and the migration shape.

## Simplification lenses

### Code and tests

Look for opportunities to:

- Delete compatibility shims or defensive guards made unnecessary by RemDo's
  supported runtime baseline.
- Replace bespoke traversal, selection, persistence, or command plumbing with an
  existing RemDo helper, Lexical primitive, or platform API.
- Collapse duplicated branches, mirrored state, adapter layers, wrapper helpers,
  or parallel data shapes that no longer buy a real boundary.
- Move behavior to the owning feature/module instead of leaking ownership through
  call-site conditionals. For editor features, keep shared base modules from
  importing feature-owned code.
- Narrow APIs so callers pass the data the callee actually owns, rather than broad
  objects that force defensive checks or synchronization.
- Prefer direct, behavior-named test setup over clever harness metadata; for
  known fixtures, avoid runtime guards that only defend the fixture itself.
- Remove obsolete comments or tracked workaround text when the code no longer
  needs it. Use only `TODO:`/`FIXME:` for newly tracked code-site follow-ups.

### Docs and skill files

Deep doc and skill-prose review is `remdo-docs-align`'s job, and routing a
doc-touching diff to it is the refine ladder's job — not this pass's. Here, read
touched docs and skills whole for context and report only violations of
`docs/documentation.md` you hit in passing.

## Finding bar

Report a finding only when it gives the author a clearer, simpler end state.
Every finding should satisfy these checks:

1. It is grounded in the reviewed diff and directly related sources.
2. It has a concrete simpler shape, not just "consider refactoring".
3. It is worth the churn: expected deletion, consolidation, or ownership clarity
   outweighs the extra edit.
4. It does not require choosing new product behavior.
5. It is not already tracked in `docs/todo.md`.

When there is a real tradeoff, report an **Option** rather than a finding. Include
brief pros/cons and mark one **Recommended** only when the code/docs give a reason
to prefer it.

Do not report:

- Formatter, lint, naming, or organization preferences — unless they materially
  shorten the end state or restore RemDo ownership boundaries.
- Broad architecture ideas unrelated to making the reviewed diff simpler.
- UI/layout conclusions that would require browser verification unless that
  verification was actually performed.
- Compatibility concerns contradicted by RemDo's pre-1.0 compatibility policy or
  supported runtime baseline.
- Deterministic cleanup already covered by a command the caller will run, unless
  the specific result changes the simplification recommendation.

## Output

Return a concise report. Sort findings by expected simplification value, not by
file order. Do not cap the list artificially; omit weak findings instead.

Use this shape:

```md
# RemDo simplify report

Scope: <committed range or working tree>
Sources read: <key files/docs, not every grep>

## Findings

- [S1|S2|S3] `<path>:<line>` — <short title>
  - Current shape: <what makes the end state longer or more complex>
  - Simpler end state: <the concrete shorter/cleaner design>
  - Why this is RemDo-simpler: <doc/ownership/baseline reason>
  - Suggested next edit: <small patch sketch or exact file/symbol to reshape>

## Options

- `<path>` — <decision>
  - Option 1: <pros / cons>
  - Option 2 **Recommended**: <pros / cons / reason>

## No findings

<Use only when no findings survived the bar. State the main areas inspected.>

Suppressed N finding(s) already tracked in docs/todo.md
```

Priority labels:

- **S1**: A design/ownership simplification likely to prevent substantial churn
  in the reviewed change.
- **S2**: A local code, test, or docs simplification that is clearly worth doing.
- **S3**: A small cleanup hint that is concrete and low-risk.

Omit empty sections. Include the suppression tail only when `N` is non-zero.

## References

- [Scope resolution](../../../tools/skills/resolve-scope.sh)
- [Agent guidelines](../../../AGENTS.md)
- [Documentation invariants](../../../docs/documentation.md#invariants)
- [Git workflow / branch base](../../../docs/contributing.md#git-workflow)
- [Runtime baseline](../../../docs/contributing.md#runtime-baseline)
- [Compatibility policy](../../../docs/contributing.md#compatibility-policy-pre-10)
- [Editor feature modules](../../../docs/contributing.md#editor-feature-modules)
- [Project principles](../../../docs/principles.md)
