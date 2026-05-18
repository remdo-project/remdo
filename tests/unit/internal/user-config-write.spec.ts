import { beforeEach, describe, expect, it } from 'vitest';
import { getTestUserConfig, resetTestUserConfig, TEST_USER_CONFIG_DOCUMENT } from '#tests';

describe('user config writes', () => {
  beforeEach(() => {
    resetTestUserConfig();
  });

  it('creates a new document in the local user config', async () => {
    const initialUserConfig = getTestUserConfig();
    expect(initialUserConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: TEST_USER_CONFIG_DOCUMENT.id, title: TEST_USER_CONFIG_DOCUMENT.title },
    ]);

    const userConfig = getTestUserConfig();
    const document = await userConfig.documentList().create('New Document');

    expect(userConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: TEST_USER_CONFIG_DOCUMENT.id, title: TEST_USER_CONFIG_DOCUMENT.title },
      { id: document.id(), title: 'New Document' },
    ]);

    const reloadedUserConfig = getTestUserConfig();
    expect(reloadedUserConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: TEST_USER_CONFIG_DOCUMENT.id, title: TEST_USER_CONFIG_DOCUMENT.title },
      { id: document.id(), title: 'New Document' },
    ]);
  });

});
