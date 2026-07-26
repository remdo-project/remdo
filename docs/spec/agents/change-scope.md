# Change scope

A change scope identifies one repository diff for agent inspection or mutation.
Resolution does not review, modify, or advance the change.

## Resolution

The caller may request `uncommitted`, a two-dot range (`<left>..HEAD`), or a
three-dot range (`<left>...HEAD`). Without input, resolution selects
`uncommitted` when the repository is dirty and `origin/main...HEAD` otherwise.

`uncommitted` compares current tracked file contents with `HEAD`, ignores
index-only state, and adds untracked files not excluded by Git's standard
ignore rules. A repository is dirty when standard Git status reports staged,
unstaged, or untracked work.

A commit range is the exact `BASE..HEAD` diff between resolved immutable
commits and requires a clean repository. For two dots, `left` must be an
ancestor of `HEAD` and becomes `BASE`; for three dots, their merge base becomes
`BASE`.

Resolution returns `no-change` when the selected diff is empty. It refuses an
invalid input or a commit range combined with uncommitted work.
