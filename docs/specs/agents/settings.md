# Agent settings

Agent settings resolve committed skill defaults with an optional
machine-local overlay. Skills read the resolved document; they do not
read the source files directly.

## Files

The committed defaults and schema are `.agents/settings.yaml` at the
repository root. The optional overlay is `agent.yaml` in the `.remdo`
directory of the current user's home directory.

A missing overlay leaves the committed document unchanged. An unreadable
or invalid overlay fails resolution.

## Resolution

Resolution runs from the current Git repository. It fails when the
committed file is missing, unreadable, or invalid, or when the overlay
exists and is unreadable or invalid.

The resolver merges the overlay onto the committed document and validates
the result. **Deterministic.**

## Merge

The overlay may only name paths present in the committed document. An
unknown path fails resolution.

At each present overlay path:

- a mapping is merged key by key into the committed mapping
- a list replaces the committed list
- a scalar replaces the committed scalar

A type that does not match the committed value at that path fails
resolution.

## Document

The resolved document is a mapping of skill names to that skill's
settings.

### remdo-verify-change

```yaml
remdo-verify-change:
  reviewers: [<reviewer-id>, ...]
  providers:
    <reviewer-id>:
      model: <model>
      effort: <effort>
```

`reviewers` is a nonempty list of unique **reviewer ids**. Each id is a
key in `providers`. Each provider entry has nonempty `model` and
`effort` strings. `providers` may include ids not listed in `reviewers`.

## Result

On success, the resolver writes the complete resolved document as YAML to
standard output. On failure, it writes a reason to standard error and
exits nonzero.
