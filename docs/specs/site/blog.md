# Blog

The **blog** is RemDo's public, dated posts at `/blog/`, authored as repository
Markdown. It is a [public page](../../architecture.md#public-pages) surface: readable without
sign-in, rendered without the editor runtime, and trusted like a page source.
Posts have no web-level editing; a post is published when its file is deployed.

## Posts

A post is a Markdown file `content/blog/<slug>.md`, served at `/blog/<slug>/`
with a canonical URL on the
[configured public origin](../runtime/configuration.md#network-addressing). A slug uses lowercase letters and
digits, optionally separated by single hyphens.

Front matter supplies:

- **title:** The post's heading and browser title.
- **description:** The excerpt shown in the index and the post's meta description.
- **date:** The calendar date the post displays and is ordered by.
- **topic:** A free-text label shown beside the date.
- **image:** A site path to the post's decorative index image.
- **author:** Optional; defaults to **RemDo team**.

A missing or invalid field is an authoring error, as for any public page.
The body starts at `##` sections.

## Index

`/blog/` lists every post, newest date first and same-date posts by ascending
slug. With no posts it shows only its heading.

Each entry shows the post's image, date, topic, title, and description, and
opens the post through its **Read post** link. On narrow viewports the image
sits above the entry's text.

## Post page

A post page shows, in order:

1. An **All posts** link to `/blog/`.
2. The title, the author, and the date followed by the reading time.
3. The body, whose first paragraph is the lede and stands out from the rest.
4. The **All posts** link again and, unless the post is last in the index, a
   **Next post** teaser linking the entry that follows it in the index.

The reading time is the body's word count divided by 200, rounded up and at
least one, shown as **N min read**.

## Future

- **Feed and sitemap.** Publish an RSS feed and a sitemap once posts are
  regular enough for readers or search engines to follow.
- **Drafts.** Hold a post back from the index until it is ready.
