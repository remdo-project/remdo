import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('user config writes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a new document in the local user config', async () => {
    const { getUserConfig } = await import('@/documents/memory-user-config');

    const initialUserConfig = await getUserConfig();
    expect(initialUserConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: 'main', title: 'Main' },
    ]);

    const userConfig = await getUserConfig();
    const document = await userConfig.documentList().create('New Document');

    expect(userConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: 'main', title: 'Main' },
      { id: document.id(), title: 'New Document' },
    ]);

    const reloadedUserConfig = await getUserConfig();
    expect(reloadedUserConfig.documentList().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: 'main', title: 'Main' },
      { id: document.id(), title: 'New Document' },
    ]);
  });
});
