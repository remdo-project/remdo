import type { TestContext } from 'vitest';
import { meta } from '#tests';
import { describe, expect, it } from 'vitest';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';
import { normalizeDocumentId } from '@/routing';

describe('collaboration document id resolution', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('generates a unique document id by default', async ({ remdo }: TestContext) => {
    const docId = remdo.getCollabDocId();
    expect(normalizeDocumentId(docId)).toBe(docId);
  });

  it(
    'uses the injected doc id from the test harness',
    meta({ collabDocId: 'testDocHarness' }),
    async ({ remdo }: TestContext) => {
      expect(remdo.getCollabDocId()).toBe('testDocHarness');
    }
  );
});
