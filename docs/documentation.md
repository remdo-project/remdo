# Documentation

RemDo's durable documentation follows the ownership, contract, structure, and
maintenance rules below.

## Intent

**Governing principle:** Write the smallest contract sufficient for faithful
implementation.
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
  [README](specs/feedback-cases/README.md) owns the evidence structure and
  maintenance rules.
- **`docs/dev/` root — Contributor policy.** Root developer documents establish
  standards and decision defaults for contributions.
- **`docs/dev/guides/` — Developer guides.** Guides explain how a developer
  accomplishes a task. Their steps derive from and link to the applicable
  contract and mechanism owners.
- **`AGENTS.md` and `CLAUDE.md` — Agent instructions.** They own repository-wide
  and provider-specific rules for agent work and link to the contracts and
  contributor policy governing their decisions.
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
  inbound links, and removes the former normative definition in the same
  change.

## Contracts

Contracts are clear without consulting external sources.

**Normative default.** Contract clauses are normative unless marked otherwise.

### Target behavior

A durable specification states its target behavior as fact in timeless prose,
regardless of implementation status.

Known gaps between target behavior and implementation are tracked in
[RemDo TODO](todo.md).

### Minimality

- **Misuse test.** Keep a clause only when its removal could permit an incorrect
  interpretation or implementation. Take surrounding rules at face value;
  anticipated rationalization does not justify restatement.
- **Information value.** The declared reader, document title and location,
  surrounding clauses, and linked owners all contribute to a contract's
  meaning. Each clause adds information needed for faithful interpretation or
  implementation.
- **Excluded material.** Contract clauses exclude inventories, non-contract
  implementation details, how-to prose, and redundant restatement.
- **Property over mechanism.** State the property a mechanism must have, not the
  mechanism. A detail belongs in the contract when choosing differently would
  break the promise; one that only determines how the promise is met belongs in
  the implementation. Named external interfaces, flags, and settings are
  mechanisms.
- **Rationale.** Keep brief rationale only when removing it could reopen a
  settled decision.
- **Edge behavior.** Preserve materially relevant boundaries, failures, and
  no-ops.
- **Sufficiency.** If two reasonable implementers could produce materially
  different behavior, clarify the contract or surface the unresolved product
  decision.

## Documentation changes

A documentation change touches only regions needed for its intended semantic
difference. Preserve unaffected wording and structure; separate unrelated
cleanup. For an explicit realignment, whole-scope conformance is the intended
difference. Check sufficiency before compressing.

## Document structure

Every document begins with a title. A concise introduction supplies intent or
responsibility boundaries beyond those already established by the title and
opening structure.

Establish triggers, inputs, scope, rules, and concepts before dependent
behavior.
Describe actions in causal order, keep exceptions and no-ops beside what they
modify, and state results after the behavior producing them. Organize
non-procedural contracts by responsibility in dependency order.

State owned behavior positively. Retain a negation only when it prevents a
credible misuse.

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

Use for brief triggers describing long-horizon, non-target direction.

#### References

Use for external sources and dependencies the document relies on.

## Specification structure

1. Each specification defines the expected behavior or required structure of
   one coherent repository capability or technical component.
2. Each heading path identifies one cohesive responsibility worth locating or
   linking to. Place each section beneath the narrowest parent containing its
   responsibility, and all material at the narrowest level that owns it.
3. When a parent naturally divides into parallel variants, stages, or
   components, its children use that division consistently.
4. Keep examples and scenarios beneath their rules and only when they
   distinguish behavior more efficiently than prose or prevent credible
   misinterpretation.
5. A generic container or document-wide section exists only when it represents
   a real shared responsibility.

<!-- markdownlint-disable-next-line MD024 -->
## References

- [Diátaxis: reference](https://diataxis.fr/reference/) — reference-writing
  discipline; structure mirrors the maintained system.
- [Every Page Is Page One](https://everypageispageone.com/the-book/) —
  self-containment, scope-first, subject-affinity linking.
- [Write the Docs: docs as code](https://www.writethedocs.org/guide/docs-as-code/)
  — docs reviewed and tested like code.
- [Google style: timeless documentation](https://developers.google.com/style/timeless-documentation)
  — timeless prose.
- [arc42](https://arc42.org/overview) — decision rationale as load-bearing.
- [Microsoft style: headings](https://learn.microsoft.com/en-us/style-guide/scannable-content/headings)
  — heading granularity and run-in headings.
- [GitHub Copilot: effective review instructions](https://docs.github.com/en/copilot/tutorials/customize-code-review)
  — concise, focused instructions for coding agents.
