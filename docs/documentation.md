# Documentation

RemDo's durable documentation follows the ownership, contract, structure, and
maintenance rules below.

## Intent

**Governing principle:** Write the smallest contract sufficient for faithful implementation.
Smallness lowers review cost; sufficiency prevents agents from inventing product
decisions. Readers take contracts at face value.

RemDo's contracts answer "what is the accepted behavior of X?" for
contributors and coding agents fluent in the stack. Human guides and agent
instructions answer different questions through the owners below and follow
the applicable ownership and structure rules.

## Documentation layout

Each durable statement lives with the owner of the question it answers.

- **`docs/` root — Project-wide documents.** Root files own repository- or
  corpus-wide contracts, current tracking, and archived follow-up.
- **`docs/specs/` — [Specifications](#specification-structure).**
- **`docs/specs/feedback-cases/` — Specification evidence.** Its
  [README](specs/feedback-cases/README.md) owns the evidence structure and maintenance rules.
- **`docs/dev/` root — Contributor policy.** Root developer documents establish
  standards and decision defaults for contributions.
- **`docs/dev/guides/` — Developer guides.** Guides explain how a developer
  accomplishes a task. Their steps derive from and link to the applicable
  contract and mechanism owners.
- **Agent skills — Specifications and procedures.** Specifications under
  `docs/specs/agents/skills/` own accepted behavior; each `SKILL.md` owns its
  execution procedure.
- **`AGENTS.md` and `CLAUDE.md` — Agent instruction surfaces.**
  The surfaces own their directly loaded rules; [Agent instructions](specs/agents/instructions.md)
  owns their design, responsibilities, and deterministic structural contracts.
- **Executable owners — Tool implementation.** Non-contract execution details
  stay with their scripts, configuration, or other executable owners.

## Ownership

- **Single source.** Each behavior and precise term has one current owner; each
  precise term uses the name established by its owner. Other documents link to
  that owner rather than restate or shadow its contract. Local rules and tracked
  gaps include only required owned context; neither becomes another owner. No
  sources define conflicting target behavior.
- **Internal owners.** A document links inline at first use of another owner's
  term or contract.
- **Contract migration.** A migration moves the complete contract, updates
  inbound links, and removes the former normative definition in the same change.

## Contracts

Contracts are clear without consulting external sources.

**Normative default.** Contract clauses are normative unless marked otherwise.

### Target behavior

A durable specification states its target behavior as fact in timeless prose,
regardless of implementation status.

[Tracked follow-up](todo.md#tracked-follow-up) records future work and known
gaps. Entries range from decided changes to unresolved questions and preserve
only the context useful for returning to the work.

### Minimality

- **Misuse test.** Keep a clause only when its removal could permit an incorrect
  interpretation or implementation. Take surrounding rules at face value;
  anticipated rationalization does not justify restatement.
- **Information value.** The declared reader, document title and location,
  surrounding clauses, and linked owners all contribute to a contract's
  meaning. Each clause adds information needed for faithful interpretation or implementation.
- **Excluded material.** Contract clauses exclude inventories, non-contract
  implementation details, how-to prose, and redundant restatement.
- **Property over mechanism.** State the property a mechanism must have, not the
  mechanism. A detail belongs in the contract when choosing differently would
  break the promise; one that only determines how the promise is met belongs in
  the implementation. Named external interfaces, flags, and settings are mechanisms.
- **Rationale.** Keep brief rationale only when removing it could reopen a
  settled decision.
- **Edge behavior.** Preserve materially relevant boundaries, failures, and no-ops.
- **Sufficiency.** If two reasonable implementers could produce materially
  different behavior, clarify the contract or surface the unresolved product decision.

### Verification

Prefer deterministic coverage: repository-owned automation that decides
conformance with a repeatable machine-checkable result at a defined lifecycle point.

- **Lifecycle.** During requirement design, a maintainer may add a marker,
  including from an agent proposal grounded in research or repository evidence
  of a durable, non-local coverage risk. Routine review treats existing markers
  as accepted requirements and reports uncovered gaps without adding or
  reconsidering markers; reconsider them only while refining the owning contract.
- **No admission value.** A marker never justifies adding or retaining a
  requirement; the clause must already satisfy [Ownership](#ownership) and [Minimality](#minimality).
- **Marker scope.** Append **Deterministic.** to the clause it qualifies. The
  marker identifies the required property, not the test, command, or
  implementation that covers it, and does not claim exhaustive coverage of
  surrounding behavior.

## Documentation changes

A documentation change touches only regions needed for its intended semantic
difference. Preserve unaffected wording and structure; separate unrelated
cleanup. For an explicit realignment, whole-scope conformance is the intended
difference. Check sufficiency before compressing.

## Document structure

Every document begins with a title. A concise introduction supplies intent or
responsibility boundaries beyond those already established by the title and
opening structure.

Establish triggers, inputs, scope, rules, and concepts before dependent behavior.
Describe actions in causal order, keep exceptions and no-ops beside what they
modify, and state results after the behavior producing them. Organize
non-procedural contracts by responsibility in dependency order.

State owned behavior positively. Retain a negation only when it prevents a
credible misuse.

Markdown line-length lint counts each link or image by its label rather than
its hidden destination syntax. **Deterministic.**

### Lists

Use bullets when three or more peer items need to be located, compared, or
assessed independently. Use nested bullets only for a meaningful parent-child
relationship in which each child expands its parent's responsibility. Keep a
compact sequence inline when separating its items would not improve scanning.

### Diagrams

Use a diagram only when it makes an important relationship materially clearer
than prose. Keep the smallest diagram sufficient to answer its question and
split views when secondary relationships obscure the primary one. Include only
relevant states and transitions, but retain critical ownership, safety, and
rollback boundaries regardless of duration. A diagram has the normative status
of its surrounding content unless marked illustrative.

When a diagram is primary, it owns the actors, relationships, order, and loops
it shows; do not restate them. Label steps with activities and transitions with
the conditions or results that redirect or advance the flow. Use short,
familiar labels, define unfamiliar markers in an adjacent legend, and never rely
on color or styling alone. Add bullets or prose only for essential information
absent from the diagram, surrounding contract, and linked owners; prefer bullets
when they are equally clear.

For a primary-path flow, left-align its steps on one causal axis and place
optional, exceptional, and feedback paths to the right. Avoid crossings and use
return references when complete paths would reduce clarity. Fence plain-text
diagrams as `text` and use a small, consistent grammar of familiar arrows and
box-drawing characters.

Draft from the diagram outward:

1. Draw the smallest diagram that answers the document's visual question.
2. Add an adjacent legend only for symbols that are not self-explanatory.
3. Add brief run-in bullets only for required information absent from the
   diagram and linked owners.
4. Add prose only when neither the diagram, a label, a legend entry, nor a bullet
   can express the information as clearly.
5. Remove any text that merely walks through the diagram or mirrors its nodes.

### Common supporting sections

Reserve these names for their stated responsibilities; name other
responsibilities directly.

#### Definitions

Define each document-owned term once: here when readers need to find it
independently, otherwise at first use.

#### Empirical checks

Use only when authoritative dependency contracts and repository-owned automated
tests cannot establish implementation conformance with a meaningful
machine-checkable result, a reliable signal, and acceptable cost at a defined
lifecycle point. List only behavior requiring empirical confirmation;
empirical checks do not replace deterministic coverage.

An empirical check has no committed executable, scenario, or evidence artifact.
When behavior becomes suitable for automated coverage, that coverage replaces
its empirical classification.

A check carries a brief rationale when the behavior it confirms is not derivable
from its dependency contracts, so that a later reader does not retire the check
by reasoning from those contracts alone.

#### Future

Use for brief triggers describing long-horizon work related to the owned behavior.

#### References

Use for external sources and dependencies the document relies on.

## Specification structure

1. A durable specification owns the expected behavior or required structure of
   one capability or technical component that remains meaningful independently
   of the repository change. Its title, path, and scope opener identify that
   subject. Create a durable specification only when no existing owner can
   coherently own that subject; otherwise improve the applicable owners. A
   repository change is not itself a durable specification subject.
2. Each heading path identifies one cohesive responsibility worth locating or
   linking to. Place each section beneath the narrowest parent containing its
   responsibility, and all material at the narrowest level that owns it.
3. When a parent naturally divides into parallel variants, stages, or
   components, its children use that division consistently.
4. Keep examples and scenarios beneath their rules and only when they
   distinguish behavior more efficiently than prose or prevent credible misinterpretation.
5. A generic container or document-wide section exists only when it represents
   a real shared responsibility.

<!-- markdownlint-disable-next-line MD024 -->
## References

- [Diátaxis: reference](https://diataxis.fr/reference/) — reference-writing
  discipline; structure mirrors the maintained system.
- [Every Page Is Page One](https://everypageispageone.com/the-book/) — self-containment, scope-first, subject-affinity linking.
- [Write the Docs: docs as code](https://www.writethedocs.org/guide/docs-as-code/) — docs reviewed and tested like code.
- [NASA Systems Engineering Handbook](https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf) — verification methods recorded with their requirements.
- [Google style: timeless documentation](https://developers.google.com/style/timeless-documentation) — timeless prose.
- [arc42](https://arc42.org/overview) — decision rationale as load-bearing.
- [Microsoft style: headings](https://learn.microsoft.com/en-us/style-guide/scannable-content/headings) — heading granularity and run-in headings.
- [GitHub Copilot: effective review instructions](https://docs.github.com/en/copilot/tutorials/customize-code-review)
  — concise, focused instructions for coding agents.
