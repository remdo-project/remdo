import type { TestContext } from 'vitest';
import { meta } from '#tests';
import { describe, expect, it } from 'vitest';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration document id resolution', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('generates a unique document id by default', async ({ remdo }: TestContext) => {
    expect(remdo.getCollabDocId()).toMatch(/^test-/);
  });

  it(
    'uses the injected doc id from the test harness',
    meta({ collabDocId: 'test-doc' }),
    async ({ remdo }: TestContext) => {
      expect(remdo.getCollabDocId()).toBe('test-doc');
    }
  );
});
