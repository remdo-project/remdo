import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration smoke', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('lexical helpers operate in collaboration mode', async ({ remdo }) => {
    await remdo.mutate(() => {
      $getRoot().clear();
    });

    expect(remdo).toMatchOutline([{ noteId: null }]);
    await remdo.waitForSynced();
  });
});
