import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

describe('collaboration smoke', () => {
  it('lexical helpers operate in collaboration mode', async ({ remdo }) => {
    await remdo.mutate(() => {
      $getRoot().clear();
    });

    expect(remdo).toMatchOutline([]);
    await remdo.waitForSynced();
  });
});
