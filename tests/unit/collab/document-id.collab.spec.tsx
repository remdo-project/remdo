import type { TestContext } from 'vitest';
import { describe, expect, it } from 'vitest';

describe('collaboration document id resolution', () => {
  it('generates a unique document id by default', async ({ lexical }: TestContext) => {
    expect(lexical.getCollabDocId()).toMatch(/^test-/);
  });

  it(
    'uses the doc id from the query string',
    { meta: { collabDocId: 'test-doc' } } as any,
    async ({ lexical }: TestContext) => {
      expect(lexical.getCollabDocId()).toBe('test-doc');
    }
  );
});
