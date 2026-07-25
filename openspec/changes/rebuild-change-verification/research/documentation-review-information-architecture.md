# Documentation review information architecture

Exploration notes for `rebuild-change-verification`, 2026-07-17. These notes
are not an approved requirement or design.

This is a versioned, non-normative research artifact stored with the originating
change. It is not part of the contract approval surface.

## Re-entry

This exploration is preserved here without changing accepted policy. When it
resumes:

- Keep the complete synchronized main specs, applicable permanent designs,
  active tasks, and readiness result as the contextual approval surface.
- Use Git diff only when a before/after comparison helps; OpenSpec deltas remain
  mechanically checked transport rather than a second semantic review surface.
- Start with the concrete artifact sweep below. Prototype navigation or changed-
  section highlighting without creating another authority.
- Promote a rule through a separate OpenSpec change only after
  `rebuild-change-verification` finishes, or on a separately confirmed branch,
  and only when the feedback triggers below justify it.
- Keep OpenSpec-generated refreshes separate from logical policy and artifact
  changes.

## Working conclusion

Optimize the human attention required to verify changed meaning, not document
length in isolation.

> One authority, task-fit representation, cheap discovery.

Each durable claim has one authoritative expression, owned according to what
the claim means. Use the clearest precise representation in that owner. Other
appearances are links, mechanically derived views, evidence, or explicitly
historical snapshots rather than independently maintained restatements.

A useful failure test:

> If one occurrence changes and a person must remember to reconcile another,
> both occurrences are acting as authorities.

This is stricter and more operational than "minimize redundancy," but does not
mistake links, evidence, or derived views for semantic duplication.

## Deliberate review-surface choice

The user deliberately reviews the complete updated main spec in its durable
context and uses Git when a before/after delta is useful. Do not replace that
with an OpenSpec-delta-only review surface.

The optimization is therefore:

- preserve the complete contextual main-spec view;
- remove repeated semantic work across artifacts;
- keep logical changes visually distinct from mechanical propagation; and
- make changed or novel decisions easy to locate without replacing the full
  context.

## Separate dimensions

Artifact ownership and representation are independent choices.

| Meaning | Default owner |
|---|---|
| Required behavior or constraint | Spec |
| Intentional architecture and load-bearing rationale | Permanent design |
| Decision history and alternatives for a change | Change design or ADR |
| Exact executable detail without an independent contract | Code, config, or schema |
| Incomplete obligation | Task |
| Proof that an obligation is satisfied | Test or check result |
| Proposed requirement transport | OpenSpec delta |
| Human navigation or review presentation | Derived view |

The owner may use prose, a diagram, a table, structured data, or code. A flow
diagram is not inherently design:

- If it defines required ordering, gates, or loops, it can be normative in a
  spec.
- If it shows chosen components or internal orchestration, it belongs in
  design.
- If both aspects matter, split the behavioral topology from the component
  mapping instead of cloning the whole flow.

Likewise, a `12px` value belongs only in code/config when it is incidental. If
preserving it requires approval, distinguish the accepted outcome or reason
from the executable value.

## Completeness without repetition

Completeness is scoped to ownership:

- A spec is complete for the promises it owns.
- A design is complete for the consequential architecture and decisions it
  owns.
- Neither retells the other.
- Dependencies on other owners are explicit, one-hop links.

This suggests replacing a broad "self-contained" reading with "locally
complete, globally linked": an artifact fully defines its own claims and names
the other owners it depends on.

Related representations have distinct roles:

```text
authority -> realization -> evidence
    |
    +------> links / generated review views
```

Code implementing a requirement and a test proving it are not competing
definitions when their roles are explicit.

## Human review surface

The complete durable contract remains the review surface. A generated or
ephemeral navigation overlay could help a reviewer move through that full
context by presenting:

1. Changed authoritative claims and decisions, each exactly once.
2. The minimum unchanged context needed to judge each change.
3. Direct links to the durable owners.
4. Requirement -> decision -> implementation -> evidence traceability.
5. Logical changes separately from generated/mechanical propagation.
6. Open questions, trade-offs, and gaps that need human judgment.

Agents perform exhaustive consistency, coverage, and drift checks. The human
reviews novel intent and consequential decisions. AI summaries remain
navigation aids, not authorities.

The overlay must not replace the complete synchronized main specs and applicable
permanent designs, become another authority, or require semantic review of the
OpenSpec delta as a second copy. Git already provides the optional before/after
view.

## Candidate durable rules

1. Every durable claim has one canonical owner; independently maintained
   paraphrases are defects.
2. Choose representation by the judgment required: diagrams for topology,
   sequence, and loops; tables for exact mappings; prose for qualifications and
   rationale; code/config for executable facts.
3. Elsewhere use a typed link, a mechanically derived view, evidence, or the
   minimum task-local context. Any summary must not add normative meaning.
4. Optimize review units rather than word count: present one coherent changed
   decision at a time and separate semantic changes from mechanical refreshes.
5. Make discovery deterministic with stable capability/requirement names,
   ownership routing, one-hop links, and path-aware agent instructions.

Suggested review questions:

- Ownership: if this claim changes, what single location must be edited?
- Representation: is that location using the fastest precise form for the
  judgment required?
- Discovery: can a reader arriving from the likely entry points find it in one
  hop?
- Drift: are all other appearances derived, linked, evidential, or historical?
- Review: can the human identify every new decision without rereading unchanged
  material?

## Current repository implications

- `docs/documentation.md` already optimizes reader cost and contains useful
  single-source, linking, and minimality rules, but it predates the OpenSpec
  foundation. It was adapted to OpenSpec without fully redefining permanent
  design ownership or review views.
- "Self-contained behavior" and "single source per topic" can pull in opposite
  directions if self-contained is read as requiring restatement. Clarify the
  ownership-scoped meaning.
- Permanent capability designs are a RemDo extension not described by the
  installed OpenSpec 1.6 schema. Their role needs an explicit local definition.
- The current workflow and verifier diagrams mix contractual lifecycle with
  skill/component composition. Apply the ownership/representation split.
- Reviewer intent belongs behaviorally in the spec; exact prompt composition
  belongs in design or skill implementation.
- Tasks currently repeat detailed acceptance semantics. They can name and link
  incomplete obligations instead.
- OpenSpec delta duplication is required transport. Treat it as a
  machine-checked mirror and exclude it from a second semantic review.

## Current artifact sweep

### Keep as the authority for its role

- `openspec/specs/agent-skill-remdo-verify-change/spec.md`: scope, mode,
  reviewer obligations, outcomes, reviewer-attempt semantics, and convergence
  are accepted behavior.
- `openspec/specs/development-change-workflow/spec.md`: approval surface,
  lifecycle gates and loops, baseline, handoffs, and finalization are accepted
  behavior.
- `openspec/changes/rebuild-change-verification/proposal.md`: motivation, scope,
  capability routing, and impact are concise proposal context.
- `openspec/changes/rebuild-change-verification/design.md`: the two-owner
  replacement, survivor audit, alternatives, and reasons are change history.
- The reviewer-wave topology, adapter choices, prompt composition, and aggregate
  data shape in the verifier permanent design are current architecture.
- Concrete branch gates, composed commands, and execution procedure belong in
  the implementing skills. Test inventories and unfinished migrations belong in
  tasks.

### Consolidate when planning resumes

- Put each required state transition and loop in one normative diagram in its
  main spec. The verifier and workflow permanent designs currently redraw parts
  of behavior already owned by their specs.
- Replace the workflow design's lifecycle redraw with a compact mapping from
  lifecycle phases to involved skills. Keep only component ownership, skill
  composition, and architectural rationale there.
- Keep the verifier design's reviewer-wave detail. Replace its top-level
  convergence redraw with architecture that is not already defined by the spec,
  or link to the spec's canonical flow.
- Keep reviewer outcomes compact in the verifier spec and the detailed reviewer
  instruction in the design. The implementing skill should consume or link that
  instruction rather than maintain a third paraphrase.
- Shorten tasks to distinct unfinished operations and coverage obligations;
  link their owning requirement or design instead of restating its acceptance
  semantics.
- Keep only executable procedure in `remdo-change-flow`: branch-gate commands,
  supporting-skill calls, baseline recording, checks, and archival mechanics.
  Link lifecycle behavior instead of paraphrasing it.
- Treat both delta specs as generated or mechanically maintained transport.
  Verify equivalence to the main specs, but review changed meaning in the full
  main-spec context once.
- Update `AGENTS.md` during implementation so applicable permanent designs join
  main specs and incomplete tasks in the branch reading rule. The existing task
  2.6 already owns that gap.

### Unresolved contract fork found by the sweep

The verifier accepts either a clean, commit-resolved Git range or an
uncommitted candidate. Its convergence rule also lets the coordinator fix an
accepted finding and rerun the complete verification wave. A fix to a clean
range makes the worktree dirty, so the resulting candidate is no longer the
declared range. The artifacts do not define whether the verifier:

1. returns findings and requires a later invocation over a newly committed
   range;
2. changes to a combined range-plus-uncommitted scope;
3. commits each accepted fix before rerunning; or
4. drops clean-range verification.

This is the first decision to resolve before canonicalizing the flow. Options 2
and 3 conflict with the current simplicity and commit-permission choices; do not
silently infer either. The retired `remdo-refine` chose option 3 by declaring an
autonomous commit scope and keeping a fixed base while `HEAD` advanced. The new
verifier has deliberately inherited neither that lifecycle nor its commit
permission.

### Suggested introduction sequence

1. Resolve the clean-range/fix-loop fork in exploration.
2. Reconcile this change's main specs and permanent designs using the ownership
   split above; keep logical edits separate from delta refreshes.
3. Simplify the active tasks and, during implementation, the skills without
   changing accepted behavior.
4. Use the feedback signals below for the rest of this change.
5. If the pattern recurs, start a separate change for the repo-wide rules in
   `docs/documentation.md`; change `development-change-workflow` only if the
   approval surface itself changes.

## Evidence and caveats

The strongest support is for reducing ambiguous duplicate authorities,
maintaining traceability, and using change-focused review. Evidence does not
establish a universal best document format.

- OpenSpec: behavior-first specs, implementation mechanics in design/tasks,
  optional technical designs, and deltas for review efficiency:
  <https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md>
- NASA requirements guidance: resolve duplicated requirements and maintain
  traceability among requirements, design, implementation, and tests:
  <https://www.nasa.gov/reference/6-2-requirements-management/>
- OASIS DITA: author topic-oriented canonical content and assemble different
  deliverables/views:
  <https://docs.oasis-open.org/dita/dita/v1.3/cos01/part1-base/dita-v1.3-cos01-part1-base.pdf>
- Cognitive-load research: independently intelligible duplicate information can
  impair processing, while separated complementary sources can create
  split-attention/search costs. This is indirect evidence for software-doc
  review, not a direct proof:
  <https://doi.org/10.1002/(SICI)1099-0720(199908)13:4%3C351::AID-ACP589%3E3.0.CO;2-6>
- Diagram research supports task/representation fit rather than diagrams being
  universally superior:
  <https://www.sciencedirect.com/science/article/pii/S0364021387800265>
- Small, focused changes are reviewed faster and more thoroughly in established
  engineering guidance:
  <https://google.github.io/eng-practices/review/developer/small-cls.html>
- Architecture-documentation research found no universal comprehension winner
  between structured and narrative formats in one limited study; source
  familiarity and information sought mattered:
  <https://arxiv.org/abs/2305.17286>
- Coding-agent evidence supports targeted context and good navigation rather
  than showing every matching passage:
  <https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/aci.md>
- Long-context models may miss or be distracted by relevant information among
  irrelevant context, though results vary by model and task:
  <https://aclanthology.org/2024.tacl-1.9/>
  <https://proceedings.mlr.press/v202/shi23a.html>

The specific hypothesis that repeated familiar text switches a reviewer into
"scanning mode" and hides adjacent novelty is plausible but was not directly
established by the research found. Test it locally rather than treating it as
settled science.

## Proposed experiments

1. Apply the placement rubric to the current workflow and verifier artifacts;
   record where it reduces reading versus creates navigation overhead.
2. Prototype a non-authoritative review bundle for this change before changing
   durable policy.
3. Ask current Codex and Claude instances a fixed set of contract, rationale,
   implementation, and evidence questions; record correctness and files read.
4. Compare review of the current artifact set with the canonicalized bundle:
   time, missed decisions, lookup count, and confidence.
5. Only then revise `docs/documentation.md`, `AGENTS.md`, OpenSpec configuration,
   and the active change.

## Cheap feedback signals

Avoid raw word count as the primary metric: it rewards cryptic writing and
penalizes useful context. Prefer signals already produced during normal work.

Per change, record only events that actually occur:

- **Clarity friction:** "what does this mean?"
- **Duplication friction:** "why is this here twice?"
- **Ownership friction:** "where is this defined / why is it in this artifact?"
- **Hidden-path friction:** a condition, branch, or loop was omitted from the
  clearest representation.
- **Review noise:** logical and generated/mechanical changes were interleaved.
- **Attention loss:** the reviewer explicitly noticed switching to scanning.
- **Late intent repair:** implementation or verification forced a requirement
  correction after approval.
- **Agent ambiguity:** a reviewer could not identify one authoritative source.

Useful low-cost metrics:

1. Number of independently maintained authorities for one claim. Target: one.
2. Number of changed authoritative sections or decisions the human must judge.
   This is the semantic review load; lines changed are only supporting data.
3. Navigation hops from a likely entry point to the owner. Prefer owner-local
   content or one explicit hop.
4. Friction events by category, inferred from normal review comments rather
   than a separate form.
5. Post-approval intent repairs and source-ambiguity findings.
6. Binary separation of semantic changes from mechanical propagation.

Triggers for improvement work:

- Any authority collision or source ambiguity: fix immediately.
- The same friction category recurring within a change: revisit that artifact
  or representation before approval.
- Attention loss: run a restatement/unchanged-boilerplate sweep.
- A late intent repair: determine whether the contract was missing, unclear, or
  simply contradicted by implementation.
- A semantic edit requiring judgment in multiple durable files: consolidate
  ownership or make the secondary form mechanical.
- After a small run of changes, compare categories and late repairs; change the
  policy only for repeated patterns, not isolated taste.

## Independent review convergence

Three fresh research/audit agents and a separate Claude consultation converged
on the same core: one normative owner, other appearances derived/linked/
evidential/historical, and a change-focused review view. Claude summarized it
as "single point of authority, many points of discovery" and warned that
deduplication alone will not prevent every missed novel clause.
