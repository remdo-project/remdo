---
name: playground
description: Create an interactive HTML playground for visual configuration, immediate preview, and a copyable prompt. Use when the user asks for a playground, explorer, or interactive tool. This Claude-only RemDo adapter publishes ignored scratch through the development server.
---

# Playground

Read the complete [playground specification](../../../docs/specs/agents/skills/playground.md)
before acting. It owns the capability's behavior, repository effects, and result.

## Load the dependency

Resolve exactly one installed official skill at:

```text
~/.claude/plugins/cache/claude-plugins-official/playground/*/skills/playground/SKILL.md
```

Read it and the matching file under its `templates/` directory. Select the
template from the requested explorer type; stop under the specification's
[dependency rule](../../../docs/specs/agents/skills/playground.md#dependency)
if the skill or template cannot be resolved unambiguously.

Before creating files, resolve the canonical origin:

```sh
tools/env.sh pnpm exec tsx tools/dev/print-app-public-url.ts
```

## Generate

Follow the official skill and template, applying the RemDo
[explorer boundary](../../../docs/specs/agents/skills/playground.md#explorer).
Inspect relevant RemDo UI source only when the requested subject requires it.
Create `public/playground/` if needed, then generate the complete HTML at a
run-owned temporary path under
`public/playground/` whose name does not match `index-*.html`.

## Publish

Apply the specification's [publication contract](../../../docs/specs/agents/skills/playground.md#publication)
with these repository mechanics:

1. Choose the lowest unused `index-N.html` path.
2. If `index.html` is a regular file rather than a symlink, move it to that
   path and choose the next unused path for the new artifact.
3. Move the completed temporary file to the new numbered path.
4. Run `ln -sfn index-N.html public/playground/index.html` with the new filename.

Track every path and move owned by the run. If publication stops, reverse its
completed moves, restore the prior `index.html` state, and remove its temporary
or numbered artifact.

## Report

Append `/playground/index.html` to the resolved origin and return the
specification's [result](../../../docs/specs/agents/skills/playground.md#result).
When addressing a human, render it under the shared
[report contract](../../../docs/specs/agents/protocol.md#reports).
