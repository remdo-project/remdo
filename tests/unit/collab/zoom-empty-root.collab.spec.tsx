import { describe, expect, it } from 'vitest';
import { clearEditorProps, meta, registerEditorProps } from '#tests';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('zoom visibility (collab hydration)', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  const zoomKey = registerEditorProps('zoom-empty-root', { zoomNoteId: 'missing-note' });

  it(
    'does not crash when zoom note id is set before outline exists',
    meta({ collabDocId: 'zoomEmptyRoot', editorPropsKey: zoomKey }),
    async ({ remdo }) => {
      try {
        await remdo.waitForSynced();
        expect(remdo.getCollabDocId()).toBe('zoomEmptyRoot');
      } finally {
        clearEditorProps(zoomKey);
      }
    }
  );
});
