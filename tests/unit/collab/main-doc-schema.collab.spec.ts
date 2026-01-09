/* eslint-disable node/no-process-env */
import { describe, expect, it } from 'vitest';
import { assertEditorSchema } from '@/editor/plugins/dev/schema/assertEditorSchema';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collab main document schema (experimental)', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  const enabled = process.env.REMDO_VALIDATE_MAIN_DOC === '1';
  it.skipIf(!enabled)(
    'matches the schema for the live main document',
    { meta: { collabDocId: 'main', preserveCollabState: true } } as any,
    async ({ remdo }) => {
      const state = remdo.getEditorState();
      expect(() => assertEditorSchema(state)).not.toThrow();
    }
  );
});
