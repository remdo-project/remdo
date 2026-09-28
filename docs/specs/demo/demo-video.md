# Demo video

The demo video is a scripted, repeatable recording of RemDo in use that
covers its main capabilities in one run.

## Recording run

A run takes a target RemDo origin, which defaults to
`https://remdo.com`, and acts as that origin's
[`user` account](../runtime/configuration.md#deployment-accounts).

1. [Reset the account](../../guides/production-deployment.md#reset-the-demo-account).
2. Perform each [chapter](#chapters) in order through the target's real user
   interfaces and confirm its end state.
3. Return the video, playable by current major browsers, and a poster image
   showing its final frame.

## Authenticity

Everything a recording shows is live behavior of the target origin and of the
services a chapter names, except annotations, which are visibly distinct
from the product.

## Presentation

- **Panes.** A recording shows one or two panes side by side, each a separate
  browser session. A pane appears or disappears within a recording as a chapter
  requires. With one pane, the page occupies the whole frame and lays
  itself out for that size rather than being scaled or cropped.
- **Annotations.** Each keystroke and pointer action is captioned as it
  happens, with a visible pointer for pointer actions. A title introduces each
  chapter.
- **Pacing.** Typing and transitions run at a speed a viewer can follow, and
  each result stays visible long enough to read.

## Chapters

The video contains these chapters in order.

- **Outlining.** One pane creates a nested outline, then indents, reorders,
  folds, and zooms it using the keyboard. End state: the document holds the
  outline in its final structure.
- **Collaboration.** Two panes edit one document as two sessions, each seeing
  the other's edits. End state: both panes show the same document containing
  both sessions' edits.
- **Claude.** One pane holds a conversation with Claude using RemDo's
  [MCP server](../integrations/mcp.md); the other shows the document it
  writes. End state: the document contains notes that conversation created,
  whatever their text.

## Future

- Narration or background audio.
- Motion post-production such as zooming into a region, animated titles, or
  intro and outro sequences.
