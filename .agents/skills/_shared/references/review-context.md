# Reading review evidence

Use this procedure for evidence reads in convergence, simplification
assessments, and verification. The repository's [reading rules](../../../../AGENTS.md#routes) govern required
full documents and their reuse or reload after changes and context loss.

Read required owners in batches that fit the enclosing tool response budget,
accounting for the combined output of parallel reads. Split a large document
into consecutive ranges to complete its required read. If output is truncated,
recover the omitted files or ranges rather than repeating the whole batch;
a truncated response does not establish that a required document was read in
full.

Within the same agent context, carry loaded owners forward across skill phases
and convergence iterations under the reading rules above. A new independent
reviewer loads its own applicable owners; coordinator summaries and earlier
review conclusions do not replace its source evidence.

Use the assessment target to locate implementation evidence, starting with
the selected diff for a change target. Then read relevant
definitions, tests, and callers in bounded ranges. Expand those reads when
dependencies or unresolved questions require it, until the complete selected
scope is assessed. Avoid dumping whole directories or repeating full diffs
when a targeted read answers the remaining question.
