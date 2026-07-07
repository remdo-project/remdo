# Standing keeps

Stage-4 suppression state: before the proposal table reaches the
adjudicators, the coordinator drops any proposal whose quoted text matches an
entry below (whitespace-normalized substring match) and reports
`Suppressed N standing keep(s)` in the stage-5 report. Only user verdicts
enter — including borderline keeps, which are exactly the clauses that
otherwise get re-litigated every run. Removing an entry is the deliberate act
that reopens one; prune an entry when its quoted text no longer exists in the
doc (and say so in the report).

- `docs/outliner/deletion.md` — "`Delete` at the end of a note matches
  `Backspace` at the start of the next note" — KEEP (borderline; readability,
  hard to reconstruct from the per-key branches; survived four proposals) —
  2026-07-07
- `docs/architecture.md` — "Using a gateway keeps origin/routing behavior
  simple and reduces CORS/auth drift" — KEEP (settled-choice rationale) —
  2026-07-06
- `docs/outliner/folding.md` — "Leaf notes never show the toggle." — KEEP
  (borderline; an inert-but-visible toggle would satisfy the foldability rule
  while violating this line) — 2026-07-06
- `docs/todo.md` — "Clear out drifted long-horizon items" — KEEP (live
  tracked task, not rule restatement) — 2026-07-06
