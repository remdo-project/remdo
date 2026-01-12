import { expect, it } from 'vitest';
import { meta } from '#tests';

it('preview helper example (manual use only)', meta({ fixture: 'basic' }), async () => {
  // Uncomment preview() when debugging locally to render the current outline.
  // preview();
});

it('loads basic outline structure from JSON', meta({ fixture: 'basic' }), async ({ remdo }) => {
    expect(remdo).toMatchOutline([
    {
      noteId: 'note1',
      text: 'note1',
      children: [
        {
          noteId: 'note2',
          text: 'note2',
        },
      ],
    },
    {
      noteId: 'note3',
      text: 'note3',
    },
  ]);
});

it.fails('fails when a warning is logged to the console', () => {
  console.warn('intentional warning to assert console guard');
});
