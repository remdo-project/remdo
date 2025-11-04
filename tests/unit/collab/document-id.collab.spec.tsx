import type { TestContext } from 'vitest';
import { describe, expect, it } from 'vitest';
import { config } from '#config/client';
import { DEFAULT_DOC_ID } from '#config/spec';

describe.skipIf(!config.COLLAB_ENABLED)('collaboration document id resolution', () => {
  it('falls back to the default document id', async ({ lexical }: TestContext) => {
    expect(lexical.getCollabDocId()).toBe(DEFAULT_DOC_ID);
  });

  it(
    'uses the doc id from the query string',
    { meta: { collabDocId: 'test-doc' } } as any,
    async ({ lexical }: TestContext) => {
      expect(lexical.getCollabDocId()).toBe('test-doc');
    }
  );
});
