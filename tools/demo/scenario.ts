import type { OutlineNote, Pane } from './pane';
import type { Stage } from './stage';

export interface Show {
  stage: Stage;
  main: Pane;
  extra: Pane;
  documentUrl: string;
}

const OUTLINED: OutlineNote[] = [
  {
    text: 'Launch plan',
    children: [
      { text: 'Record the demo video' },
      { text: 'Write the announcement' },
      { text: 'Ship it' },
    ],
  },
  { text: 'Groceries' },
];

const COLLABORATED: OutlineNote[] = [
  {
    text: 'Launch plan',
    children: [
      { text: 'Record the demo video' },
      { text: 'Write the announcement' },
      { text: 'Ship it' },
      { text: 'Celebrate' },
    ],
  },
  { text: 'Groceries', children: [{ text: 'Milk' }] },
];

export const FINAL_OUTLINE: OutlineNote[] = [
  COLLABORATED[0]!,
  { text: 'Groceries', children: [{ text: 'Milk' }, { text: 'Bread' }] },
];

async function runMenuAction(pane: Pane, shortcut: string): Promise<void> {
  await pane.sequence(['Shift', 'Shift', shortcut]);
}

async function outlining({ stage, main }: Show): Promise<void> {
  await stage.chapter('Capture', 'Type an outline without leaving the keyboard');
  await main.type('Launch plan');
  await main.press('Enter');
  await main.press('Tab');
  await main.type('Write the announcement');
  await main.press('Enter');
  await main.type('Record the demo video');
  await main.press('Enter');
  await main.type('Ship it');
  await main.press('Enter');
  await main.press('Shift+Tab');
  await main.type('Groceries');

  await stage.chapter('Reorder', 'Move a note among its siblings');
  await main.press('ArrowUp', 2);
  await main.press('Alt+Shift+ArrowUp');

  await stage.chapter('Fold', 'Hide details until they matter');
  await main.press('ArrowUp');
  await runMenuAction(main, 'f');
  await main.pause(1200);
  await runMenuAction(main, 'f');

  await stage.chapter('Zoom', 'Focus on one branch');
  await runMenuAction(main, 'z');
  await main.pause(1500);
  await runMenuAction(main, 'o');
  await main.pause(1500);
  await main.expectOutline(OUTLINED);
}

async function collaboration({ stage, main, extra, documentUrl }: Show): Promise<void> {
  await extra.openDocument(documentUrl);
  await stage.chapter('Collaborate', 'Edits appear live in every open session');
  await stage.split(main, extra);
  await main.pause(800);

  await extra.press('Control+End');
  await extra.press('Enter');
  await extra.press('Tab');
  await extra.type('Milk');

  await main.press('ArrowDown', 3);
  await main.press('End');
  await main.press('Enter');
  await main.type('Celebrate');
  await main.pause(1500);

  await main.expectOutline(COLLABORATED);
  await extra.expectOutline(COLLABORATED);
}

// Claude is not connected yet; the pane previews where its conversation appears.
async function claude({ stage, main, extra }: Show): Promise<void> {
  await stage.chapter('Ask Claude', 'Claude reads and writes your outlines');
  await extra.page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded' });
  await main.pause(3000);
  await stage.unsplit(main);
}

async function closing({ stage, main }: Show): Promise<void> {
  await stage.chapter('Keep going', 'Back to a single pane');
  await main.press('Control+End');
  await main.press('Enter');
  await main.type('Bread');
  await main.pause(1500);
  await main.expectOutline(FINAL_OUTLINE);
}

export const CHAPTERS = [outlining, collaboration, claude, closing];
