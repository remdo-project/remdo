import type { Scenario, Stage } from './stage';

async function runMenuAction(stage: Stage, shortcut: string): Promise<void> {
  await stage.sequence(['Shift', 'Shift', shortcut]);
}

export const outlining: Scenario = {
  async run(stage) {
    await stage.chapter('Capture', 'Type an outline without leaving the keyboard');
    await stage.type('Launch plan');
    await stage.press('Enter');
    await stage.press('Tab');
    await stage.type('Write the announcement');
    await stage.press('Enter');
    await stage.type('Record the demo video');
    await stage.press('Enter');
    await stage.type('Ship it');
    await stage.press('Enter');
    await stage.press('Shift+Tab');
    await stage.type('Groceries');

    await stage.chapter('Reorder', 'Move a note among its siblings');
    await stage.press('ArrowUp', 2);
    await stage.press('Alt+Shift+ArrowUp');

    await stage.chapter('Fold', 'Hide details until they matter');
    await stage.press('ArrowUp');
    await runMenuAction(stage, 'f');
    await stage.pause(1200);
    await runMenuAction(stage, 'f');

    await stage.chapter('Zoom', 'Focus on one branch');
    await runMenuAction(stage, 'z');
    await stage.pause(1500);
    await runMenuAction(stage, 'o');
    await stage.pause(1500);
  },
  endState: [
    {
      text: 'Launch plan',
      children: [
        { text: 'Record the demo video' },
        { text: 'Write the announcement' },
        { text: 'Ship it' },
      ],
    },
    { text: 'Groceries' },
  ],
};
