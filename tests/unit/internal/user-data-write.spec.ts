import { beforeEach, describe, expect, it } from 'vitest';
import { getTestUserData, resetTestUserData, TEST_USER_DATA_DOCUMENT } from '#tests';

describe('user data writes', () => {
  beforeEach(() => {
    resetTestUserData();
  });

  it('creates a new document in the local user data', async () => {
    const initialUserData = getTestUserData();
    expect(initialUserData.getDocuments().getChildren().map((document) => ({
      id: document.getId(),
      title: document.getText(),
    }))).toEqual([
      { id: TEST_USER_DATA_DOCUMENT.id, title: TEST_USER_DATA_DOCUMENT.title },
    ]);

    const userData = getTestUserData();
    const document = await userData.getDocuments().create('New Document');

    expect(userData.getDocuments().getChildren().map((document) => ({
      id: document.getId(),
      title: document.getText(),
    }))).toEqual([
      { id: TEST_USER_DATA_DOCUMENT.id, title: TEST_USER_DATA_DOCUMENT.title },
      { id: document.getId(), title: 'New Document' },
    ]);

    const reloadedUserData = getTestUserData();
    expect(reloadedUserData.getDocuments().getChildren().map((document) => ({
      id: document.getId(),
      title: document.getText(),
    }))).toEqual([
      { id: TEST_USER_DATA_DOCUMENT.id, title: TEST_USER_DATA_DOCUMENT.title },
      { id: document.getId(), title: 'New Document' },
    ]);
  });

});
