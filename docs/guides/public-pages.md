# Public Pages

Add or edit a Markdown file in `content/pages/`. Anyone can read these pages
without signing in.

Use lowercase letters and digits, optionally separated by single hyphens. For example,
`privacy.md` is served at `/privacy/`. User documentation goes in `docs/`:
`docs/mcp.md` is served at `/docs/mcp/`. Existing application and
infrastructure routes take precedence; choose an unused name.

Fill in the required `title` and `description` fields at the top, then write the
body in Markdown:

```markdown
---
title: Privacy
description: How this instance handles your data.
---

## Your data

Write the page here. Use **bold text**, lists, and [links](https://example.com).
```

The title supplies the main heading and browser title; the description supplies
the meta description. Start body sections at `##`.
Link other site routes by root path, such as `/privacy/`, and add
`<!-- markdownlint-disable relative-links -->` below the front matter, since
lint resolves root paths against the repository.
Quote YAML values containing a colon followed by a space; use `>-` for a
multiline value.

Local edits appear on reload; production changes ship with the next deployment.
Invalid front matter is an authoring error.

See [about.md](../../content/pages/about.md) for a working page.
