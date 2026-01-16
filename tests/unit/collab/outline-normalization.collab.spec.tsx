import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration outline normalization', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it(
    'repairs orphan wrappers after hydration',
    meta({ fixture: 'editor-schema/wrapper-orphan-after-wrapper', fixtureSchemaBypass: true }),
    async ({ remdo }) => {
      await remdo.waitForSynced();
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
