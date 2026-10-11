# Demo recordings

The landing demo and [OpenAI plugin walkthrough](../integrations/openai-plugin.md#review-walkthrough) are separate scenarios for
scripted, repeatable recordings of RemDo in use.

## Recording run

A run records its selected scenario on the checkout's [running development instance](../../guides/local-development.md#run-main-development)
as that scenario's dedicated account, leaving other accounts' data unchanged.
Selecting no scenario records the landing demo.

1. Create the account if missing, and reset it to a single empty document.
2. Perform the scenario and confirm its end states.
3. Return separate files for each scenario: a video playable by current major
   browsers and a poster showing its final frame before the closing card.

## Authenticity

Everything a recording shows is live behavior of the instance and of the
services a chapter names, except annotations, which are visibly distinct
from the product. Development-only tooling stays hidden.

## Presentation

- **Panes.** A recording shows one or two panes side by side, each a separate
  browser session or client transcript. A pane appears or disappears within a
  recording as a chapter requires, sliding in or out rather than cutting. Once
  the layout settles, each page occupies its whole area and lays itself out for
  that size rather than being scaled or cropped.
- **Annotations.** A title introduces each chapter. Key captions are
  optional; when enabled, each key press and pointer action is captioned as it
  happens, with a visible pointer for pointer actions.
- **Pacing.** Typing and transitions run at a speed a viewer can follow, and
  each result stays visible long enough to read.

## Landing demo

The landing demo's chapters tell one story, planning and publishing the demo
video itself, in this order. Conversations with Claude use RemDo's
[MCP server](../integrations/mcp.md) in the demo's own chat surface, styled as
part of the video rather than as any Claude app; their end states constrain
which notes exist, never Claude's wording.

- **Outline it.** The video opens on an empty plan document, and the viewer
  types its top-level steps and the details of the last one by keyboard. End
  state: the document holds that outline.
- **Ask Claude.** One message at a time, a conversation asks Claude to fill in
  two of the steps, and its notes appear under each step live beside the
  conversation. End state: both steps hold notes.
- **Big picture.** The whole plan folds to its top-level steps, staying folded
  apart from the step the teammate later unfolds to work in.
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

## References

- [Recorder help](../../../tools/demo/scenario.ts) — `pnpm demo:record --help` for invocation, prerequisites and outputs.
