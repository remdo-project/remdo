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
image: /site-assets/blog/language-learning-cover.webp
social_image: /site-assets/blog/language-learning-social.png
social_image_alt: Language practice in ChatGPT, with a lesson recap and tasks saved in RemDo.
---

An opening paragraph, shown larger as the lede.

## First section

Write the post here. Use **bold text**, lists, and [links](https://example.com).
```

Write `date` unquoted. Add `author` to credit someone other than the RemDo team.

The first paragraph uses the lede style automatically. To extend that style
to another opening paragraph, wrap it in `<p class="landing-blog-lede">`
and `</p>`, with no blank lines inside the block.

The `image` is a square cover shown beside the post in the index. Use a file
under `public/site-assets/blog/`, such as one of the covers already there, or
add a square WebP of at least 720 pixels. The path is not checked, so confirm
the cover appears in the index.

For a link preview, add `social_image` with a site path to a landscape image
and `social_image_alt` with a short description of the artwork. A 1200 × 630 PNG
works for the current previews. These optional fields leave the square index
cover unchanged. Without them, sharing uses the index cover and the post title
as its alternative text. Include the image in the pull request and check that
its URL loads on the public site after deployment; social services cannot read
localhost previews.

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

Commit the post's media under `public/site-assets/blog/`, including the
full-quality MP4 and its poster. Files in the repository ship in every image, so
before merging, a maintainer encodes each video as H.264 MP4 with
`-movflags +faststart`, adds it as `public/blog/<name>.mp4` in the
[remdo-share](https://github.com/remdo-project/remdo-share) repository, points
its source at `https://share.remdo.com/blog/<name>.mp4`, and amends or squashes
the branch so no commit still holds the video. Confirm every media URL loads
before merging the post. Embed only media this site or `share.remdo.com`
serves: a third-party player sends readers' data to that service, which the
[project principles](../principles.md#data-and-trust) allow only when the
operator configures it.
