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
  typingSpeed: 50,
  // Pause between steps: after typing a phrase, pressing a key, or clicking.
  betweenSteps: 0.45,
  // Whether key presses and clicks get a caption at the bottom, with a visible
  // mouse pointer for clicks.
  keyCaptions: false,
  // How long a key's caption stays on screen (also slows each press).
  keyCaption: 0.5,
  // How long a chapter title card stays up.
  chapterTitle: 2.2,
  // How long the closing card shows before the video ends on it.
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
  //await chapter('Outline it', 'Sketch the plan without leaving the keyboard');
  await main.type('Prepare the demo');
  await main.newNote();
  await main.type('Record the demo');
  await main.newNote();
  await main.type('Publish the demo video');
  await main.newNote();
  await main.indent();
  await main.type('Keep it keyboard-first');
  await main.newNote();
  await main.type('Show Claude and a teammate');
  await main.expect(`
    Prepare the demo
    Record the demo
    Publish the demo video
      Keep it keyboard-first
      Show Claude and a teammate
  `);

  await chapter('Ask Claude', 'Claude fills in steps, right where you are looking');
  await chat.open();
  await split(chat);
  await chat.ask('Add a few steps under "Prepare the demo" in my Demo video doc.');
  await main.expectChildren('Prepare the demo');
  await pause('short');
  await chat.ask('Now do the same for "Record the demo".');
  await main.expectChildren('Record the demo');
  await pause(pacing.readReply);
  await unsplit();

  await chapter('Big picture', 'Fold it down to the main steps');
  await main.toDocumentEnd();
  await main.newNote();
  await main.toTopLevel();
  await main.type('Fold it down to the big picture');
  await main.foldToTopLevel();
  await pause('long');
  await pause('long');

  await chapter('Share it', 'Invite a teammate to the plan');
  await main.share('ben@example.test');

  await chapter('Work together', 'Ben edits the same plan, live');
  await ben.openHome();
  await ben.open();
  await split(ben);
  await ben.goTo('Publish the demo video');
  await ben.fold();
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
  await main.goTo('Publish the demo video');
  await main.zoomIn();
  // Ben's tab still shows the whole plan, wherever Claude adds to it.
  const notesBefore = await ben.noteCount();
  await chat.open();
  await split(chat);
  await chat.ask('What\'s in my demo video plan in RemDo?');
  chat.expectUsed('read_document');
  await pause('long');
  await chat.ask('Add anything that\'s still missing before we publish.');
  await ben.expectMoreNotesThan(notesBefore);
  await pause(pacing.readReply);
  await unsplit();

  await main.selectAll();
  await main.check();
  await main.deselect();
  await pause('long');
  await closingCard('You\'re watching it', 'Planned, shared, and shipped with RemDo');
}
