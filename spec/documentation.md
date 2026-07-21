# Documentation

This specification defines how RemDo's durable documentation is divided,
written, structured, and maintained.

## Intent

A documentation system optimizes one metric: the cost for its reader to
reliably answer the question the corpus exists to answer. Reliability comes
from trust: the documentation rules below let the reader take a doc at face
value.

This system serves contributors and coding agents, assumed fluent in the stack;
its question is "what is the accepted behavior of X?". For that expert audience
it is reference only: behavior and policy, no tutorials or how-tos. Docs for any
other audience (user- or admin-level) are a separate corpus declaring its own
reader and question — the content and structure rules carry over, the persona
does not.

## Ownership

**Single source.** Each behavior and precise term has one current owner. Other
documents link to that owner instead of redefining or shadowing it, and no two
sources describe conflicting target behavior.

**Contract migration.** A migration moves the complete contract, updates
inbound links, and removes the former normative definition in the same change.

## Contracts

Contracts are clear without consulting external sources. Their clauses are
normative unless marked otherwise and use declarative present tense.

### Target behavior

A durable specification describes accepted target behavior in timeless prose.
Temporary status, sequencing, and implementation gaps live in
[`spec/todo.md`](todo.md). Target behavior may lead implementation only while
that ledger names every known gap; the branch converges before merge.

### Minimality

**Misuse test.** A clause belongs in the contract only when its absence could
let a reader misuse the contract. The test takes surrounding rules at face
value; anticipated rationalization does not justify restatement.

**Excluded material.** Contract clauses exclude inventories, implementation
detail outside the contract, explanatory how-to prose, and redundant
restatement.

**Rationale.** A brief rationale remains only when its omission would reopen a
settled decision.

**Edge behavior.** Edge and failure semantics remain part of the contract.

## Document structure

Every durable document begins with a title and a short paragraph stating what
it covers, with any boundary needed to avoid confusion.

### Common supporting sections

These conventions give common supporting sections consistent names and
purposes.

#### Definitions

Use as the single owner for terms introduced by the document.

#### Future

Use for a brief trigger describing long-horizon, non-target direction.

#### Reference sections

**External sources.** A final `References` section lists every source and
dependency the document relies on.

**Internal owners.** Where a document relies on another owner's term or
contract, it links inline at first use so readers arriving mid-system can follow
the dependency.

## Specification structure

```text
# <title>
<Short paragraph stating what this document specifies, with any boundary needed
to avoid confusion.>

## <subject responsibility>
<rules owned by this responsibility>

### <contained responsibility>
<rules that are part of the parent responsibility>

## <another subject responsibility>
<rules owned by this responsibility>
```

The placeholders describe structural roles, not required section names.

1. Each specification owns one coherent product, development, or operational
   capability.
2. Each section owns one cohesive, reader-relevant responsibility identified by
   its heading path. Introduce a section only when its content is worth finding
   or linking to independently.
3. Each section sits beneath the narrowest parent whose responsibility contains
   it.
4. When a parent naturally divides into parallel variants, stages, or
   components, its children use that division consistently.
5. Examples and scenarios remain beneath the rules they illustrate.
6. Each piece of material sits at the narrowest level that owns it.
7. A generic container or document-wide section exists only when it represents
   a real shared responsibility.

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
