# playground

This Claude-only skill adapts the installed official playground capability to
create an interactive HTML explorer as ignored RemDo development scratch,
without adding an application route.

## Dependency

Before repository effects, load the installed official playground skill and
matching template. They own topic-specific construction; the RemDo rules below
own effects and results and win on conflict. Stop when the dependency is missing
or ambiguous.

## Explorer

Adapt the explorer to the relevant RemDo UI without mounting live RemDo
components. A request requiring live application behavior stops before effects
and reports that a separate development-route change is required.

## Publication

On an explicit request, the skill may change only ignored scratch under
`public/playground/`: replace the stable artifact and remove files created by a
stopped run. It does not change tracked files or manage a
[developer-owned process](../../../../AGENTS.md#isolation).

Generate at a temporary path, then atomically replace
`public/playground/index.html` only after the artifact is complete. A stopped
run removes its temporary file and leaves the previous stable artifact
unchanged. Other existing playground files remain untouched.

Report the complete [development origin](../../runtime/configuration.md#derivation-rules)
plus `/playground/index.html` as its canonical URL; do not open or verify it.

## Result

Return the shared [result](../protocol.md#results) envelope:

```yaml
outcome: <created | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
artifact: # if created
  path: public/playground/index.html
  url: <canonical latest URL>
reason: <condition that prevented publication> # if stopped
```

`created` requires the stable artifact to be complete. `stopped` reports why
publication failed without claiming a new artifact.
