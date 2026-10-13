# Blog Posts

Add a Markdown file to `content/blog/`. Anyone can read posts at `/blog/`
without signing in. The [blog specification](../specs/site/blog.md) owns the
behavior, and [Public Pages](public-pages.md) covers the YAML quoting, root-path
link, and publishing rules posts share with pages.

Name the file `<slug>.md`, using lowercase letters and digits, optionally
separated by single hyphens. For example, `small-things.md` is served at
`/blog/small-things/`, and a file named otherwise fails the blog.

Fill in the front matter, then write the body in Markdown:

```markdown
---
title: A place for the small things
description: A few thoughts on writing small tasks down.
date: 2026-10-07
topic: Perspectives
image: /site-assets/blog/perspectives.webp
---

An opening paragraph, shown larger as the lede.

## First section

Write the post here. Use **bold text**, lists, and [links](https://example.com).
```

Write `date` unquoted. Add `author` to credit someone other than the RemDo team.
Start body sections at `##`; the title supplies the main heading.

The `image` is a square cover shown beside the post in the index. Use a file
under `public/site-assets/blog/`, such as one of the covers already there, or
add a square WebP of at least 720 pixels. The path is not checked, so confirm
the cover appears in the index.

An invalid post [fails the whole blog](../specs/site/blog.md#posts), so check
the index and a post page after editing.

## Images and video

Add an image to the body with `![Description](/site-assets/blog/name.webp)`,
keeping the file under `public/site-assets/blog/` and describing what it shows.
Media paths are root paths, so they need the same lint comment as page links.
Use raw HTML for a caption or a video, keeping blank lines out of the block:

```html
<figure>
  <video controls playsinline preload="none" width="1280" height="720"
    poster="/site-assets/blog/clip-poster.webp">
    <source src="/site-assets/blog/clip.mp4" type="video/mp4">
  </video>
  <figcaption>What the clip shows.</figcaption>
</figure>
```

Media fits the post column, and `preload="none"` keeps a video from loading
until the reader presses play. Add `class="landing-blog-float-right"` to the
`<figure>` to float it into the top-right corner at 40% of the column, with
text wrapping on the left; narrow screens show it full width above the text.

Files in the repository ship in every image, so compress clips and keep them
short. Embed only media this site serves: a third-party player sends readers'
data to that service, which the
[project principles](../principles.md#data-and-trust) allow only when the
operator configures it.
