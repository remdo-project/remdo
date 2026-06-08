/**
 * Shared unit-test-only user-data backend.
 *
 * This keeps an isolated in-memory UserDataNote implementation out of app
 * runtime code while still letting unit tests exercise the real user-data
 * note handles and route hook shape without booting the stored/collab runtime.
 */
import { useSyncExternalStore } from 'react';
import { createUniqueNoteId } from '@/domain/notes/ids';
import { createUserDataRootNote } from '@/note-sdk';
import type { UserDataNote, UserDocument } from '@/note-sdk';

export const TEST_USER_DATA_DOCUMENT = { id: 'testDoc', title: 'Test Document' } as const;

const listeners = new Set<() => void>();
const documents: UserDocument[] = [TEST_USER_DATA_DOCUMENT];
let version = 0;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function bumpVersion() {
  version += 1;
  notifyListeners();
}

const userData = createUserDataRootNote(documents, {
  createDocument: async (title) => {
    const document = { id: createUniqueNoteId(), title };
    documents.push(document);
    bumpVersion();
    return document;
  },
  homeDocumentId: () => TEST_USER_DATA_DOCUMENT.id,
});

export function resetTestUserData(): void {
  documents.splice(0, documents.length, TEST_USER_DATA_DOCUMENT);
  bumpVersion();
}

function subscribeTestUserDataRuntime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTestUserData(): UserDataNote {
  return userData;
}

function getTestUserDataVersion(): number {
  return version;
}

function useTestUserData(): UserDataNote {
  useSyncExternalStore(
    subscribeTestUserDataRuntime,
    getTestUserDataVersion,
    getTestUserDataVersion,
  );
  return userData;
}

export function mockUserDataModule() {
  return {
    useUserData: useTestUserData,
  };
}
