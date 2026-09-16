# Running reviewers

Prepare a YAML plan under `.agent/` using the skill's [review dispatch](../SKILL.md#run-fresh-reviews):

```yaml
output_dir: .agent/reviews-iteration-1
reviews:
  - source: codex
    executable: codex
    args: [<each argument as a separate string>]
    # cwd: defaults to the runner's working directory
    # session_id: retain when assigned before launch
```

From the repository root on a POSIX host, launch one managed foreground command
with permissions covering every invocation in the plan:

```sh
node .agents/skills/remdo-verify-change/tools/run-reviews.ts .agent/review-plan.yaml
```

The [runner](../tools/run-reviews.ts) validates the plan, requires a new output directory, launches
reviewers concurrently without a shell, and saves full combined output in
`<source>.log`. It prints compact completion notices and writes `results.yaml`
with exit statuses, signals, launch or cleanup errors, and supplied session IDs.
An empty `reviews` list succeeds with no invocations. The plan
cannot grant permissions or change the enclosing sandbox; keep it unchanged
during launch.

Exit `0` means commands succeeded, not that verification passed. On exit `1`,
inspect results or the runner error; `error_code: ENOENT` identifies a missing
executable. SIGINT/SIGTERM cancel active reviewer process groups and exit
`130`/`143`. On reviewer exit, the runner terminates any remaining members of its
process group. Independently detached descendants are outside that group.
Launch or cleanup errors make that invocation unsuccessful. Incomplete runs
are not completed reviews.

After completion, read final reports from the saved output for the skill's
[result classification](../SKILL.md#run-fresh-reviews), retaining full logs for diagnostics.
