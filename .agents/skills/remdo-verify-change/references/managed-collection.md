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
reviewers concurrently without a shell, and saves full stdout and stderr
separately in `<source>.stdout.log` and `<source>.stderr.log`. It prints compact
completion notices and writes `results.yaml` with `stdout_file` and `stderr_file`
paths, exit statuses, signals, launch or cleanup errors, and supplied session IDs.
The directory exists before reviewers start, so a native final-report output path
may point inside it. Resolve such command arguments to absolute paths before launch;
the runner passes them unchanged, including when a reviewer has its own `cwd`.
An empty `reviews` list succeeds with no invocations. The plan
cannot grant permissions or change the enclosing sandbox; keep it unchanged
during launch.

Exit `0` means commands succeeded, not that verification passed. On exit `1`,
inspect results or the runner error. `error_code: ENOENT` can indicate a missing
executable or working directory; distinguish them from the error evidence.
SIGINT/SIGTERM cancel active reviewer process groups and exit
`130`/`143`. On reviewer exit, the runner terminates any remaining members of its
process group. Independently detached descendants are outside that group.
Launch or cleanup errors make that invocation unsuccessful. Incomplete runs
are not completed reviews.

After completion, collect each provider's native final report under the skill's
[result classification](../SKILL.md#run-fresh-reviews), retaining both output streams for diagnostics.
