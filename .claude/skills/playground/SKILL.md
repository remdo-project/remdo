---
name: playground
description: Create an interactive HTML playground for visual configuration, immediate preview, and a copyable prompt. Use when the user asks for a playground, explorer, or interactive tool. This Claude-only RemDo skill publishes ignored scratch through the development server.
---

# Playground

Adapt the installed official playground skill to create an interactive HTML
explorer as ignored RemDo development scratch, without adding an application
route.

## Load the dependency

Read `~/.claude/plugins/installed_plugins.json` and resolve exactly one
`installPath` for:

```text
playground@claude-plugins-official
```

Read `<installPath>/skills/playground/SKILL.md` and the closest matching file
under its `templates/` directory, adapting that template when no type fits
cleanly. They own topic-specific construction; the RemDo rules below own
effects and results and win on conflict. If the registry entry, installed
skill, or required template cannot be resolved unambiguously, then return
`stopped` before any effect.

## Explorer

An explorer representing RemDo UI matches the app's current visual conventions
and relevant component styling without mounting live components; inspect
RemDo UI source only when the subject requires it. A request requiring live
application behavior returns `stopped` before effects and reports that a
separate development-route change is required.

## Generate

On an explicit request, the skill may write `public/playground/index.html`, an
ignored file the development server serves. It does not change tracked files or
manage a [developer-owned process](../../../AGENTS.md#isolation), and it leaves
other playground files untouched.

1. From the repository root, resolve the artifact URL through the
   [shared environment launcher](../../../tools/env.sh). It appends
   `/playground/index.html` to the working directory's development
   [`APP_ORIGIN`](../../../docs/specs/runtime/configuration.md#network-addressing):

   ```sh
   ./tools/env.sh sh -c 'printf "%s/playground/index.html\n" "$APP_ORIGIN"'
   ```

   Share the URL so the developer can preview the playground as it takes shape.
2. Following the official skill and template, build the HTML directly in
   `public/playground/index.html`, creating the directory if needed. Skip the
   official skill's `open` step; the skill neither opens the URL nor verifies
   the developer-owned server.

## Report

Report under the shared [report contract](../../../docs/specs/agents/protocol.md#reports):
`created` with `public/playground/index.html` and its URL, or `stopped` with the
reason, noting that the artifact may be incomplete.
