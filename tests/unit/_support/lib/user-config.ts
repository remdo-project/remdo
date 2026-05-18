/**
 * Shared unit-test-only user-config backend.
 *
 * This keeps an isolated in-memory UserConfigNote implementation out of app
 * runtime code while still letting unit tests exercise the real user-config
 * note handles and route hook shape without booting the stored/collab runtime.
 */
import { useSyncExternalStore } from 'react';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { UserConfigNote } from '@/documents/contracts';
import { createUserConfigRootNote } from '@/documents/user-config-notes';
import type { ListedDocument } from '@/documents/user-config-notes';

export const TEST_USER_CONFIG_DOCUMENT = { id: 'testDoc', title: 'Test Document' } as const;

const listeners = new Set<() => void>();
const documents: ListedDocument[] = [TEST_USER_CONFIG_DOCUMENT];
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

const userConfig = createUserConfigRootNote(documents, {
  createDocument: async (title) => {
    return { id: createUniqueNoteId(), title };
  },
  onChange: bumpVersion,
});

export function resetTestUserConfig(): void {
  documents.splice(0, documents.length, TEST_USER_CONFIG_DOCUMENT);
  bumpVersion();
}

function subscribeTestUserConfigRuntime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTestUserConfig(): UserConfigNote {
  return userConfig;
}

function getTestUserConfigVersion(): number {
  return version;
}

function useTestUserConfig(): UserConfigNote {
  useSyncExternalStore(
    subscribeTestUserConfigRuntime,
    getTestUserConfigVersion,
    getTestUserConfigVersion,
  );
  return userConfig;
}

export function mockUserConfigModule() {
  return {
    useUserConfig: useTestUserConfig,
  };
}
