import { describe, expect, it } from 'vitest';
import { meta } from '#tests';

describe('outline normalization on load', () => {
  it(
    'repairs a root-level orphan wrapper by hoisting its children',
    meta({
      fixture: 'editor-schema/wrapper-orphan',
      fixtureSchemaBypass: true,
    }),
    async ({ remdo }) => {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1-child-of-orphaned-wrapper' },
        { noteId: 'note3', text: 'note3-root-2nd-child' },
      ]);
    }
  );

  it(
    'repairs an orphan wrapper after another wrapper by merging into the previous note',
    meta({
      fixture: 'editor-schema/wrapper-orphan-after-wrapper',
      fixtureSchemaBypass: true,
    }),
    async ({ remdo }) => {
      expect(remdo).toMatchOutline([
        {
          noteId: 'note1',
          text: 'note1',
          children: [
            { noteId: 'note2', text: 'note2-valid-child' },
            { noteId: 'note3', text: 'note3-child-of-orphaned-wrapper' },
          ],
        },
      ]);
    }
  );

});
