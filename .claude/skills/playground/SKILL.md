---
name: playground
description: Creates interactive HTML playgrounds — self-contained single-file explorers that let users configure something visually through controls, see a live preview, and copy out a prompt. Use when the user asks to make a playground, explorer, or interactive tool for a topic. RemDo override of the official playground skill — serves the file over the dev server and themes it with RemDo's Mantine tokens.
---

# Playground Builder (RemDo)

This is RemDo's override of the official `playground` plugin skill. It keeps the
plugin skill's structure, templates, and core requirements, and changes only
what's needed to fit a headless dev VM and the project's look.

## Start from the plugin skill

Read the official skill and its templates first; they hold the patterns,
prompt-output style, state model, and per-type guidance:

- The official skill:

  ```text
  ~/.claude/plugins/cache/claude-plugins-official/playground/*/skills/playground/SKILL.md
  ```

- The official templates:

  ```text
  ~/.claude/plugins/cache/claude-plugins-official/playground/*/skills/playground/templates/
  ```

  `design-playground.md`, `data-explorer.md`, `concept-map.md`,
  `document-critique.md`, `diff-review.md`, `code-map.md`

(Glob the version segment — the cache directory name changes across plugin
versions. If no path matches, the plugin isn't installed: stop and say so —
this override extends the official skill, it does not replace it.)

Follow that skill's "How to use" and "Core requirements" as written, then apply
the RemDo deltas below (they win on conflict).

## RemDo deltas

### 1. Output location — serve it over the dev server

The VM is headless (SSH + HTTP only), so the file must be reachable in a
browser, not just on disk.

- Write playgrounds into `public/playground/`. Create the folder if missing; it
  is gitignored (`/public/playground/`), so these are unversioned scratch
  artifacts, like `.agent/`.
- **Never overwrite a previous playground. Each build is a new numbered file and
  `index.html` is a symlink to the latest one:**
  1. Find the lowest `N ≥ 0` for which `index-N.html` does not yet exist; that
     is the target slot.
  2. If a real (non-symlink) `index.html` already exists, it is legacy content
     with no number — move it into the current lowest-free slot first (`git mv`
     is unnecessary; a plain `mv`), then recompute the lowest-free slot for the
     new build. This only happens once, on the first run after this scheme lands.
  3. Write the new playground to `index-N.html`.
  4. Point `index.html` at it: `ln -sfn index-N.html public/playground/index.html`
     (relative target, so the link survives a directory move; `-f` replaces an
     existing symlink, `-n` avoids dereferencing when one is already present).
  - Numbering only ever grows — do **not** prune or renumber old files. They are
    cheap gitignored scratch and serve as browsable history.
- The dev server serves `public/` at the web root, so the latest build is live
  at `http://<HOST>:<PORT>/playground/index.html`. `PORT` derives from
  `PORT_BASE` in `.env` (default `4000`). Assume the dev server (`pnpm run dev`)
  is already running — it is owned by the developer; do not start or stop it.
  Your job is to write the file and update the symlink; do **not** curl it, load
  it, or otherwise verify serving — hand the developer the URL and stop.
- **Do not run `open`** (the plugin skill's step 4) — there is no display. After
  writing the file and updating the symlink, print the full
  `/playground/index.html` URL so the developer can open it from their own
  machine.
- **Always print the URL with the VM's hostname, never a loopback/local IP**
  (`127.0.0.1`/`localhost`/a LAN IP) — the developer reaches this box by name
  over the network. Take `PORT` from the running config.

### 2. Styling — self-contained, themed with RemDo's Mantine tokens

Stay single-file (inline all CSS/JS, no bundling step). To match RemDo instead
of guessing colors, link the app's Mantine token stylesheet and theme the
playground with its `--mantine-*` variables (the dark palette, spacing, and
radius scales — no Mantine/React provider needed for the vars to resolve):

```html
<link rel="stylesheet" href="/node_modules/@mantine/core/styles.css" />
```

Use those tokens in the playground's CSS rather than literal hex/px. RemDo is
dark-themed; the app background is `#1a1b1e`.

When the playground is specifically about RemDo's editor or note UI, also link
the relevant project CSS the dev server already serves, e.g.
`<link rel="stylesheet" href="/src/client/editor/Editor.css" />`, and mirror its
class names so snippets render as in the app. Use web-root paths
(`/node_modules/...`, `/src/...`, `/public`); avoid `/@fs/...` absolute paths.

### 3. Everything else is unchanged

Follow the plugin skill as written.

## Don't reach for live React components

Linking tokens (and optionally a project CSS file) is the ceiling here. Wiring a
playground into RemDo's real React/Vite/Mantine-provider tree turns it into a
throwaway dev route, not a playground — only do that if the user explicitly asks
for live editor behavior, and say a dev route may fit better.
