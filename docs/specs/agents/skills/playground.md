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
`public/playground/`: publish the new artifact, preserve a legacy playground,
update the stable latest alias, and remove files created by a stopped run. It
does not change tracked files or manage a
[developer-owned process](../../../../AGENTS.md#isolation).

Publish each successful artifact at a unique numbered path without overwriting,
renumbering, or pruning prior playgrounds. Preserve a playground stored at
`index.html` before the stable-alias convention as a numbered artifact. Update
`public/playground/index.html` only after the new file is complete. A stopped
run leaves prior history and the latest alias unchanged.

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
  path: <numbered repository-relative HTML path>
  latest: public/playground/index.html
  url: <canonical latest URL>
reason: <condition that prevented publication> # if stopped
```

`created` requires both the numbered file and stable latest alias. `stopped`
reports why publication failed without claiming a new artifact.
