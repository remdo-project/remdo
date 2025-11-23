import { expect, it } from 'vitest';

it('preview helper example (manual use only)', async ({ lexical }) => {
  await lexical.load('basic');
  // Uncomment preview() when debugging locally to render the current outline.
  // preview();
});

it('loads basic outline structure from JSON', async ({ lexical }) => {
  await lexical.load('basic');

  expect(lexical).toMatchOutline([
    {
      text: 'note1',
      children: [
        {
          text: 'note2',
          children: [],
        },
      ],
    },
    {
      text: 'note3',
      children: [],
    },
  ]);
});

it.fails('fails when a warning is logged to the console', () => {
  console.warn('intentional warning to assert console guard');
});
