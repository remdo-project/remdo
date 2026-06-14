import { beforeEach, describe, expect, it } from 'vitest';
import { getTestUserData, resetTestUserData, TEST_USER_DATA_DOCUMENT } from '#tests';

describe('user data writes', () => {
  beforeEach(() => {
    resetTestUserData();
  });

  it('creates a new document in the local user data', async () => {
    const initialUserData = getTestUserData();
    expect(initialUserData.documents().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: TEST_USER_DATA_DOCUMENT.id, title: TEST_USER_DATA_DOCUMENT.title },
    ]);

    const userData = getTestUserData();
    const document = await userData.documents().create('New Document');

    expect(userData.documents().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: TEST_USER_DATA_DOCUMENT.id, title: TEST_USER_DATA_DOCUMENT.title },
      { id: document.id(), title: 'New Document' },
    ]);

    const reloadedUserData = getTestUserData();
    expect(reloadedUserData.documents().children().map((document) => ({
      id: document.id(),
      title: document.text(),
    }))).toEqual([
      { id: TEST_USER_DATA_DOCUMENT.id, title: TEST_USER_DATA_DOCUMENT.title },
      { id: document.id(), title: 'New Document' },
    ]);
  });

});
