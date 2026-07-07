# Documentation

How the RemDo documentation corpus is written and maintained: its intent, the
invariants every doc must satisfy, and the external sources behind them.
The agent-facing doc workflow lives in [AGENTS.md](../AGENTS.md).

## Intent

A documentation corpus optimizes one metric: the cost for its reader to
reliably answer the question the corpus exists to answer. Reliability comes
from trust: the invariants below exist so the reader can take a doc at face
value. The one sanctioned cross-check is implementation status: a doc
describes the target, not what is built, and the gap between them is tracked
in [docs/todo.md](todo.md).

This corpus serves contributors and coding agents, assumed fluent in the
stack; its question is "what is the intended behavior of X?". For that expert
audience it is reference only: target behavior, no tutorials or how-tos. Docs
for any other audience (user- or admin-level) are a separate corpus declaring
its own reader and question — the invariants carry over, the persona does not.

## Invariants

These invariants apply to every doc in the corpus, and to agent skill files
(the `.claude/`, `.codex/`, and `.agents/` skill roots), which carry the same
risks — except where an invariant is inherently about the corpus's shape rather
than a doc's content: their `References` sections link sibling skills rather
than only external sources,
and — since a skill's procedure is its contract — its steps are not the how-to
prose invariant 5 omits.

1. **Single source per topic.** Each behavior and each precise term MUST be
   defined exactly once, in the doc best suited to it, and MUST NOT be
   redefined or shadowed by any other doc. Two docs MUST NOT make contradictory
   claims about the intended system.
2. **Link by subject affinity.** Where a doc relies on a term or contract
   another doc owns, it SHOULD link there inline at first use — every doc is an
   entry point; readers arrive mid-corpus.
3. **Self-contained behavior.** A doc's behavior MUST be clear without external
   sources. A final `References` section holds the external sources the doc
   relies on (specs, standards, third-party docs) — all of those, and nothing
   incidental; cross-doc links within this corpus MUST be inline, never
   collected into `References`.
4. **Spec, not status.** A doc's normative spec MUST describe the current
   target only, in timeless prose — no temporal status like "currently", "for
   now", or feature-age "new" (a rationale sentence per invariant 5 MAY name
   a rejected alternative). Gaps, partial status, and sequencing MUST
   live in `docs/todo.md`: any divergence between a doc's claim and the code
   MUST be recorded there in an entry naming the doc it suspends — the
   recorded gap is the sanctioned interim state — and a recorded divergence
   that no longer exists MUST have its entry deleted. A long-horizon
   non-target direction MAY live as a brief trigger in the owning doc's
   `Future` section.
5. **Minimal by default.** State the rule, not the inventory: beyond what the
   other invariants require, a clause MUST be omitted unless its absence would
   let someone misuse the contract. That covers implementation detail that is
   not part of the contract, how-to steps, and rationale — though a
   one-sentence rationale MAY stay where dropping it would invite relitigating
   a settled choice. The misuse test is judged with the surrounding rules read
   at face value: a clause that only restates what an adjacent rule already
   implies MUST be omitted, and that a reader might rationalize around the
   rule is never a reason to keep it. Edge and failure semantics are part of
   the contract, not verbosity to trim.
6. **Scope first.** Every doc MUST open by stating what it covers and, where
   confusable, what it does not.
7. **Normative language.** Spec prose is normative by default, in declarative
   present tense. Uppercase MUST/SHOULD/MAY carry their RFC 2119/RFC 8174
   meanings — used sparingly, with MUST reserved for requirements whose
   violation breaks the contract; lowercase forms keep their plain-English
   meanings.
8. **Structure mirrors the product.** Doc boundaries SHOULD follow the
   product's feature and machinery boundaries, so code and docs are navigated
   in parallel.

## References

- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — normative keywords
  (invariant 7).
- [Diátaxis: reference](https://diataxis.fr/reference/) — reference-writing
  discipline; structure mirrors the product.
- [Every Page Is Page One](https://everypageispageone.com/the-book/) —
  self-containment, scope-first, subject-affinity linking.
- [Write the Docs: docs as code](https://www.writethedocs.org/guide/docs-as-code/)
  — docs reviewed and tested like code.
- [Google style: timeless documentation](https://developers.google.com/style/timeless-documentation)
  — timeless prose (invariant 4).
- [arc42](https://arc42.org/overview) — decision rationale as load-bearing
  (invariant 5's rationale slot).
