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

Read it and the closest matching file under its `templates/` directory,
adapting that template when no type fits cleanly. Stop under the specification's
[dependency rule](../../../docs/specs/agents/skills/playground.md#dependency)
only if the installed skill or a required template file cannot be resolved.

Before creating files, resolve the canonical origin:

```sh
TMPDIR=/tmp tools/env.sh pnpm exec tsx tools/dev/print-app-public-url.ts
```

## Generate

Follow the official skill and template, applying the RemDo
[explorer boundary](../../../docs/specs/agents/skills/playground.md#explorer).
Inspect relevant RemDo UI source only when the requested subject requires it.
Create `public/playground/` if needed, then generate the complete HTML at a
new, unused run-owned temporary path under `public/playground/` whose name is
neither `index.html` nor a match for `index-*.html`. Do not run the official
skill's `open` step; the publication contract owns delivery.

## Publish

Apply the specification's [publication contract](../../../docs/specs/agents/skills/playground.md#publication)
with these repository mechanics:

1. Let `N` be the smallest integer at least zero whose `index-N.html` path is
   unused.
2. If `index.html` is a regular file rather than a symlink, copy it to that
   numbered path as the legacy artifact, then recompute `N` for the new artifact.
3. Move the completed temporary file to the new `index-N.html` path.
4. Create a run-owned temporary symlink beside `index.html` with a relative
   target of the new filename, then atomically rename that symlink to
   `index.html`.

Do not replace `index.html` before the final rename. If generation or
publication stops before it, remove every temporary, new numbered, or legacy
copy created by the run, leaving prior history and `index.html` unchanged.

## Report

Append `/playground/index.html` to the resolved origin and return the
specification's [result](../../../docs/specs/agents/skills/playground.md#result).
When addressing a human, render it under the shared
[report contract](../../../docs/specs/agents/protocol.md#reports).
