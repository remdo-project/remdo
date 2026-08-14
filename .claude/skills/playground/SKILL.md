---
name: playground
description: Create an interactive HTML playground for visual configuration, immediate preview, and a copyable prompt. Use when the user asks for a playground, explorer, or interactive tool. This Claude-only RemDo adapter publishes ignored scratch through the development server.
---

# Playground

Read the complete [playground specification](../../../docs/specs/agents/skills/playground.md)
before acting. It owns the capability's behavior, repository effects, and result.

## Load the dependency

Read `~/.claude/plugins/installed_plugins.json` and resolve exactly one
`installPath` for:

```text
playground@claude-plugins-official
```

Read `<installPath>/skills/playground/SKILL.md` and the closest matching file
under its `templates/` directory, adapting that template when no type fits
cleanly. Stop under the specification's [dependency rule](../../../docs/specs/agents/skills/playground.md#dependency)
only if the registry entry, installed skill, or required template cannot be resolved.

## Generate

Follow the official skill and template, applying the RemDo [explorer boundary](../../../docs/specs/agents/skills/playground.md#explorer).
Inspect relevant RemDo UI source only when the requested subject requires it.
Create `.agent/playground/` and `public/playground/` if needed, then generate the
complete HTML at a new, unused temporary path under `.agent/playground/`. Do not
run the official skill's `open` step; the publication contract owns delivery.

## Publish

Apply the specification's [publication contract](../../../docs/specs/agents/skills/playground.md#publication)
by renaming the completed temporary file:

```sh
mv <temporary-artifact> public/playground/index.html
```

If the rename fails, remove the temporary file before returning `stopped`.

## Report

Return the specification's [result](../../../docs/specs/agents/skills/playground.md#result). When addressing
a human, render it under the shared [report contract](../../../docs/specs/agents/protocol.md#reports).
