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
  typingSpeed: 28,
  // Pause between steps: after typing a phrase, pressing a key, or clicking.
  betweenSteps: 0.45,
  // Whether key presses and clicks get a caption at the bottom, with a visible
  // mouse pointer for clicks.
  keyCaptions: false,
  // How long a key's caption stays on screen (also slows each press).
  keyCaption: 0.5,
  // How long a chapter title card stays up.
  chapterTitle: 2.2,
  // How long the closing card stays up at the end of the video.
  closingCard: 4,
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
 * What the script works with: `main` is the viewer's RemDo tab filling the
 * screen, `ben` is a teammate's RemDo tab, and `chat` is a Claude
 * conversation. `split(pane)` slides a tab in beside `main`.
 */
export interface Show {
  main: Pane;
  ben: Pane;
  chat: Chat;
  chapter: (title: string, description: string) => Promise<void>;
  closingCard: (title: string, description: string) => Promise<void>;
  split: (pane: Pane | Chat) => Promise<void>;
  unsplit: () => Promise<void>;
  pause: (length: PauseLength) => Promise<void>;
}

export async function script({ main, ben, chat, chapter, closingCard, split, unsplit, pause }: Show): Promise<void> {
  await chapter('Plan with Claude', 'Ask in plain words; Claude writes the plan into RemDo');
  await chat.open();
  await split(chat);
  await chat.ask('I\'m filming a short demo of RemDo. Jot down the steps to get it ready in RemDo.');
  await pause(pacing.readReply);
  await main.open();
  await unsplit();
  await main.expectMoreNotesThan(1);

  await chapter('Make it yours', 'Add a step and its details by keyboard');
  await main.toDocumentEnd();
  await main.newNote();
  await main.toTopLevel();
  await main.type('Publish the demo video');
  await main.newNote();
  await main.indent();
  await main.type('Keep it keyboard-first');
  await main.newNote();
  await main.type('Show Claude and a teammate');
  await main.goTo('Publish the demo video');
  await main.foldToTopLevel();
  await pause('long');
  //await main.unfoldAll();
  //await main.zoomIn();
  //await pause('long');
  //await main.zoomOut();

  await chapter('Share it', 'Invite a teammate to the plan');
  await main.goHome();
  await main.share('ben@example.test');
  await main.open();

  await chapter('Work together', 'Ben edits the same plan, live');
  await main.unfoldAll();
  await ben.openHome();
  await ben.open();
  await split(ben);
  await ben.goTo('Show Claude and a teammate');
  await ben.newNote();
  await ben.type('I\'ll do the voice-over');
  await main.goTo('Keep it keyboard-first');
  await main.type(' and short');
  await pause('long');
  await main.expectUnder('Publish the demo video', 'I\'ll do the voice-over');
  await ben.expectUnder('Publish the demo video', 'Keep it keyboard-first and short');
  await unsplit();

  await chapter('Pick it up later', 'A new chat reads the plan back from RemDo');
  const notesBefore = await main.noteCount();
  await chat.open();
  await split(chat);
  await chat.ask('What\'s in my demo video plan in RemDo?');
  chat.expectUsed('read_document');
  await pause('long');
  await chat.ask('Add anything that\'s still missing before we publish.');
  await main.expectMoreNotesThan(notesBefore);
  await pause(pacing.readReply);
  await unsplit();

  await main.goTo('Publish the demo video');
  await main.zoomIn();
  await pause('long');
  await main.selectAll();
  await main.check();
  await main.deselect();
  await pause('long');
  await closingCard('You\'re watching it', 'Planned, shared, and shipped with RemDo');
}
