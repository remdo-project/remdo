import { describe, it } from 'vitest';

describe('collab schema normalization (fixtures)', () => {
  it.skip('normalizes wrapper list items with multiple nested lists', async ({ remdo }) => {
    await remdo.load('invalid/invalid-wrapper-multi-list');
    await remdo.waitForSynced();
  });
});
