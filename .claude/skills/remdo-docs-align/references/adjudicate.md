# Adjudication — prompt template

Inputs: `{RULES_DOC}` — the rules doc; `{PROPOSALS}` — the advocate's
numbered proposal file. Run conditions: [SKILL.md](../SKILL.md), stage 4.

---

A deletion advocate has reviewed this corpus against {RULES_DOC}; its
numbered proposals are in {PROPOSALS}. Adjudicate every proposal against the
rules doc and apply what survives.

The face-value tie-breaker, applied strictly: the corpus intent promises that
a reader takes every rule at face value. An exhaustive rule ("only X",
"never Y", "exactly one", "MUST NOT") already forecloses everything outside
it, so a clause that restates what an adjacent rule already implies MUST be
deleted. "A reader might rationalize around the rule", "it closes a gap",
"it reinforces the point", or "extra safety for important data" are NEVER
valid keep-reasons — they contradict the corpus's own trust model. A
keep-reason is valid only if it names a concrete misuse that remains possible
even when the adjacent rule is read at face value, or if the text falls under
a carve-out the rules doc grants — its minimal-by-default rule and its
invariants preamble, e.g. edge and failure semantics, the one-sentence
rationale where dropping it would invite relitigating a settled choice, a
skill's procedural steps and sibling-link References. One decided precedent:
a proposal targeting a navigation-only section whose links are load-bearing
resolves as relocate-then-delete — move each link inline to its subject's
first substantive mention, then delete the section; neither wholesale keep
nor wholesale delete is correct there.

Default to applying. If deciding a proposal requires choosing between two
conflicting sanctioned rules, do not decide it: mark it ESCALATE and name the
conflict. Keep the corpus coherent — fix links and anchors that deletions
move — and leave the doc gates clean. Finish with a per-proposal
disposition list: applied / rejected plus the concrete surviving misuse or
the granting carve-out / ESCALATE plus the conflict. When producing
verdict-only output (a dual-adjudication session), end with exactly one line
per proposal — `N: APPLY` or `N: REJECT` with nothing else on the line — so
the two lists diff mechanically; grounds go above the verdict block, never
appended to its lines.
