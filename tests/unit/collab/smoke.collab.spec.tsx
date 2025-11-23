import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

describe('collaboration smoke', () => {
  it('lexical helpers operate in collaboration mode', async ({ lexical }) => {
    await lexical.mutate(() => {
      $getRoot().clear();
    });

    expect(lexical).toMatchOutline([]);
    await lexical.waitForSynced();
  });
});
