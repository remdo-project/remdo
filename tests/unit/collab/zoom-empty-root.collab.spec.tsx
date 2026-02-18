import { describe, expect, it } from 'vitest';
import { meta } from '#tests';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('zoom visibility (collab hydration)', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it(
    'does not crash when zoom note id is set before outline exists',
    meta({ collabDocId: 'zoomEmptyRoot', editorProps: { zoomNoteId: 'missing-note' } }),
    async ({ remdo }) => {
      await remdo.waitForSynced();
      expect(remdo.getCollabDocId()).toBe('zoomEmptyRoot');
    }
  );
});
