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
import { DEFAULT_USER_DOCUMENT } from '@/documents/defaults';
import { createUserConfigRootNote } from '@/documents/user-config-notes';
import type { ListedDocument } from '@/documents/user-config-notes';

const listeners = new Set<() => void>();
const documents: ListedDocument[] = [DEFAULT_USER_DOCUMENT];
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
  createDocument: async (position, title) => {
    void position;
    return { id: createUniqueNoteId(), title };
  },
  onChange: bumpVersion,
});

export function resetTestUserConfig(): void {
  documents.splice(0, documents.length, DEFAULT_USER_DOCUMENT);
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
