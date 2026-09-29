// The demo video, top to bottom. To preview a change, start the local dev
// server (`pnpm run dev`), run `pnpm demo:record`, and open the dev server's
// address signed out: the home page plays the new recording. Add --final for
// the full-speed video to publish.

import type { Chat } from './chat';
import type { Pacing, Pane, PauseLength } from './pane';

// How the video feels. Times are in seconds at full (--final) speed; quick
// previews play everything `quickPreviewSpeedup` times faster.
export const pacing: Pacing = {
  // Characters typed per second.
  typingSpeed: 14,
  // Pause after a key press before the next step.
  afterEachKey: 0.45,
  // How long a key's caption stays on screen (also slows each press).
  keyCaption: 0.5,
  // How long a chapter title card stays up.
  chapterTitle: 2.2,
  // How long the split-screen slide takes.
  splitScreen: 0.9,
  // Used by pause('short'): a beat to notice a change.
  shortPause: 0.8,
  // Used by pause('long'): time to take in a result.
  longPause: 1.5,
  // How long Claude's answer stays up before the chat closes.
  readReply: 3,
  // How much faster the default quick preview runs.
  quickPreviewSpeedup: 5,
};

/**
 * What the script works with: `main` is the RemDo tab filling the screen,
 * `other` is a second tab of the same user that slides in beside it, and
 * `chat` is a Claude conversation shown in that same side slot.
 */
export interface Show {
  main: Pane;
  other: Pane;
  chat: Chat;
  chapter: (title: string, description: string) => Promise<void>;
  split: () => Promise<void>;
  unsplit: () => Promise<void>;
  pause: (length: PauseLength) => Promise<void>;
}

export async function script({ main, other, chat, chapter, split, unsplit, pause }: Show): Promise<void> {
  await chapter('Capture', 'Type an outline without leaving the keyboard');
  await main.type('Launch plan');
  await main.newNote();
  await main.indent();
  await main.type('Write the announcement');
  await main.newNote();
  await main.type('Record the demo video');
  await main.newNote();
  await main.type('Ship it');
  await main.newNote();
  await main.outdent();
  await main.type('Groceries');

  await chapter('Reorder', 'Move a note among its siblings');
  await main.up(2);
  await main.moveNoteUp();

  await chapter('Fold', 'Hide details until they matter');
  await main.up();
  await main.fold();
  await pause('long');
  await main.fold();

  await chapter('Zoom', 'Focus on one branch');
  await main.zoomIn();
  await pause('long');
  await main.zoomOut();
  await pause('long');
  await main.expect(`
    Launch plan
      Record the demo video
      Write the announcement
      Ship it
    Groceries
  `);

  await other.openDocument();
  await chapter('Collaborate', 'Edits appear live in every open session');
  await split();
  await pause('short');
  await other.toDocumentEnd();
  await other.newNote();
  await other.indent();
  await other.type('Milk');
  await main.down(3);
  await main.toLineEnd();
  await main.newNote();
  await main.type('Celebrate');
  await pause('long');
  const collaborated = `
    Launch plan
      Record the demo video
      Write the announcement
      Ship it
      Celebrate
    Groceries
      Milk
  `;
  await main.expect(collaborated);
  await other.expect(collaborated);
  await unsplit();

  await chat.open();
  await chapter('Ask Claude', 'Claude reads and writes your outlines');
  await split();
  await chat.ask('Add a top-level note "Weekend trip" to my RemDo document, with three things to pack under it.');
  await main.expectNoteWithChildren('Weekend trip');
  await pause(pacing.readReply);
  await unsplit();

  await chapter('Keep going', 'Back to a single pane');
  await main.toDocumentEnd();
  await main.newNote();
  await main.outdent();
  await main.type('Share the video');
  await pause('long');
  await main.expectLastNote('Share the video');
}
