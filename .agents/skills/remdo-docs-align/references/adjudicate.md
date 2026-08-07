# Adjudication — prompt template

Inputs: `{RULES_DOC}` — the rules doc; `{PROPOSALS}` — the advocate's
numbered proposal file after the caller's fixed-scope filter. Run conditions:
[SKILL.md](../SKILL.md), stage 4. The specification/procedure boundary follows [Documentation layout](../../../../docs/documentation.md#documentation-layout).

---

A deletion advocate has reviewed this corpus against {RULES_DOC}; its
numbered proposals are in {PROPOSALS}. Adjudicate every proposal against the
rules doc.

Two modes, set by the caller. **Verdict-only (dual adjudication, stage 4's
default):** two independent adjudicators each emit verdicts only and edit
nothing; their lists are diffed before any edit happens. **Applying (a single
standalone adjudicator):** decide and apply what survives. The per-mode
instructions are in the closing paragraph.

The caller has removed proposals that exceed its fixed scope or require an
outside-scope repair. Do not broaden that scope.

The face-value tie-breaker, applied strictly: the corpus intent promises that
a reader takes every rule at face value. An exhaustive rule ("only X",
"never Y", "exactly one", "must not Y") already forecloses everything outside
it, so delete a clause that restates what an adjacent rule already implies. "A
reader might rationalize around the rule", "it closes a gap", "it reinforces
the point", or "extra safety for important data" are never valid keep-reasons —
they contradict the corpus's own trust model. A
keep-reason is valid only if it names a concrete misuse that remains possible
even when the adjacent rule is read at face value, or if the text falls under
a rules-doc carve-out: materially relevant boundary, failure, and no-op
semantics; clauses needed to prevent materially different behavior from
reasonable implementations; brief rationale where dropping it would invite
relitigating a settled choice. A skill's procedural steps and sibling-link
References are also valid keep-reasons. One decided precedent: a proposal
targeting a navigation-only section whose links are load-bearing resolves as
relocate-then-delete — move each link inline to its subject's first substantive
mention, then delete the section; neither wholesale keep nor wholesale delete
is correct there.

Default to keeping a proposal (APPLY its removal). If deciding a proposal
requires choosing between two conflicting sanctioned rules, do not decide it:
mark it ESCALATE and name the conflict. In applying mode, keep the corpus
coherent — fix links and anchors that deletions move — and leave the doc gates
clean; finish with a per-proposal disposition list: applied / rejected plus the
concrete surviving misuse or the granting carve-out / ESCALATE plus the
conflict. In verdict-only mode (a dual-adjudication session), edit nothing and
end with exactly one line per proposal — `N: APPLY`, `N: REJECT`, or
`N: ESCALATE` with nothing else on the line — so the two lists diff
mechanically; grounds go above the verdict block, never appended to its lines.
