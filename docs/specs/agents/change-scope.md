# Change scope

A change scope identifies one repository diff for agent inspection or mutation.
Resolution does not review, modify, or advance the change.

## Resolution

The caller may request `uncommitted`, a two-dot range (`<left>..HEAD`), or a
three-dot range (`<left>...HEAD`). Without input, resolution selects
`uncommitted` when the repository is dirty and `origin/main...HEAD` otherwise.

`uncommitted` contains Git's staged and unstaged changes plus untracked files
not excluded by standard ignore rules. A repository is dirty when standard Git
status reports any such work.

A commit range is the exact `BASE..HEAD` diff between resolved immutable
commits and requires a clean repository. For two dots, `left` must be an
ancestor of `HEAD` and becomes `BASE`; for three dots, their merge base becomes
`BASE`.

Resolution returns `no-change` when the selected diff is empty. It refuses an
invalid input or a commit range combined with uncommitted work.

## Result type

`ChangeScopeResult` has this complete shape:

```yaml
state: <ready | no-change | failed>
selection: <uncommitted | requested or default Git range> # if resolved
kind: <uncommitted | commit-range> # if resolved
base: <immutable comparison-base commit | UNCOMMITTED> # if resolved
head: <immutable HEAD commit> # if resolved
files: # if resolved
  - <repository-relative path>
input: <supplied scope input> # if failed and supplied
reason: <resolution failure> # if failed
```

`ready` has one or more files; `no-change` has an empty file list. For a commit
range, `base` and `head` identify the selected repository state independently of
later ref movement. An uncommitted result describes the selected paths at
resolution; its caller owns their stability. A failed result retains the
supplied input when one exists.

### Caller-visible display

A human-facing display of a selected scope is `uncommitted changes` for an
uncommitted scope or the requested or default Git range for a commit range. It
does not expose resolved immutable commit IDs.
