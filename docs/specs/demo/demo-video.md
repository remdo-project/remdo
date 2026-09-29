# Demo video

The demo video is a scripted, repeatable recording of RemDo in use that
covers its main capabilities in one run.

## Recording run

A run records the checkout's running development instance as a dedicated demo
account, leaving other accounts' data unchanged.

1. Create the demo account if missing, and reset it to a single empty document.
2. Perform each [chapter](#chapters) in order through the instance's real user
   interfaces and confirm its end state.
3. Return the video, playable by current major browsers, and a poster image
   showing its final frame before the closing card.

## Authenticity

Everything a recording shows is live behavior of the instance and of the
services a chapter names, except annotations, which are visibly distinct
from the product. Development-only tooling stays hidden.

## Presentation

- **Panes.** A recording shows one or two panes side by side, each a separate
  browser session. A pane appears or disappears within a recording as a chapter
  requires, sliding in or out rather than cutting. Once the layout settles,
  each page occupies its whole area and lays itself out for that size rather
  than being scaled or cropped.
- **Annotations.** A title introduces each chapter. Key captions are
  optional; when enabled, each key press and pointer action is captioned as it
  happens, with a visible pointer for pointer actions.
- **Pacing.** Typing and transitions run at a speed a viewer can follow, and
  each result stays visible long enough to read.

## Chapters

The chapters tell one story, planning and publishing the demo video itself,
in this order. Conversations with Claude use RemDo's
[MCP server](../integrations/mcp.md) in the demo's own chat surface, styled as
part of the video rather than as any Claude app; their end states constrain
which notes exist, never Claude's wording.

- **Plan with Claude.** The video opens on an empty plan document; a plain
  request asks Claude to fill it, and its notes appear there live beside the
  conversation. End state: the document holds Claude's plan.
- **Make it yours.** A step with details is added by keyboard, and the whole
  plan folds to its top-level steps, staying folded until the teammate unfolds
  it.
  End state: the details sit under that step.
- **Share it.** The demo account shares the plan with a second account from
  the document's own menu. End state: the second account is among the plan's recipients.
- **Work together.** Both accounts edit the plan side by side, each seeing the
  other's edits. End state: both panes show both accounts' edits.
- **Pick it up later.** A new conversation asks what the plan contains, and
  Claude reads it from RemDo to summarize it; a follow-up asks Claude to add
  what is missing. End state: Claude read the plan, and it holds more notes
  than before.
- **Ship it.** The view, zoomed into the publishing step since the second
  conversation, checks it off with everything under it, and the video ends on a
  closing card telling the viewer the video they are watching is the result.

## Future

- Narration or background audio.
- Motion post-production such as zooming into a region, animated titles, or
  intro and outro sequences.
