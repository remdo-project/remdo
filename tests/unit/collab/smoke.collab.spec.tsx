import { config } from '#config';
import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

describe.skipIf(!config.env.COLLAB_ENABLED)('collaboration smoke', () => {
  it('lexical helpers operate in collaboration mode', async ({ lexical }) => {
    await lexical.mutate(() => {
      $getRoot().clear();
    });

    expect(lexical).toMatchOutline([]);
    await lexical.waitForCollabReady();
  });
});
