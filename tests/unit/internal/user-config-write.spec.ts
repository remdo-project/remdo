import { beforeEach, describe, expect, it } from 'vitest';
import { getTestUserConfig, resetTestUserConfig } from '#tests';

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
      { id: 'main', title: 'Main' },
    ]);

    const userConfig = getTestUserConfig();
    const document = await userConfig.documentList().create('New Document');

    expect(userConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: 'main', title: 'Main' },
      { id: document.id(), title: 'New Document' },
    ]);

    const reloadedUserConfig = getTestUserConfig();
    expect(reloadedUserConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: 'main', title: 'Main' },
      { id: document.id(), title: 'New Document' },
    ]);
  });
});
