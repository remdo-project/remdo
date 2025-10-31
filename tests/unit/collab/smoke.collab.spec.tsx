import { env } from '#config/env.client';
import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

describe.skipIf(!env.collabEnabled)('collaboration smoke', () => {
  it('lexical helpers operate in collaboration mode', async ({ lexical }) => {
    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);

    await lexical.mutate(() => {
      $getRoot().clear();
    });

    expect(lexical).toMatchOutline([]);

    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
  });
});
