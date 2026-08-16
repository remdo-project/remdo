# Assessment target

An assessment target selects repository material for read-only assessment. It
neither grants mutation authority nor defines the assessment.

A change target uses [change scope](change-scope.md):

```yaml
target:
  kind: change
  scope: <uncommitted | Git range> # optional
```

An omitted target resolves as a change target using change scope's default.

A subject target selects one existing repository-relative file or directory in
the current tree:

```yaml
target:
  kind: subject
  path: <file or directory>
```

Natural-language input must identify one valid target unambiguously.
Resolution stops on invalid or ambiguous input and does not perform assessment
or advance another capability's lifecycle.

## Result type

`AssessmentTarget` is one of these successfully resolved variants. Its change
variant uses the [change-scope result](change-scope.md#result-type).

```yaml
kind: change
scope: <ChangeScopeResult>
```

```yaml
kind: subject
path: <repository-relative file or directory>
```
