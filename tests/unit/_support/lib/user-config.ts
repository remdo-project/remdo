/**
 * Shared unit-test-only user-config backend.
 *
 * This keeps an isolated in-memory UserConfigNote implementation out of app
 * runtime code while still letting unit tests exercise the real user-config
 * note handles and route hook shape without booting the stored/collab runtime.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { UserConfigNote } from '@/documents/contracts';
import { DEFAULT_USER_DOCUMENT } from '@/documents/defaults';
import { createUserConfigRootNote } from '@/documents/user-config-notes';
import type { ListedDocument } from '@/documents/user-config-notes';

const listeners = new Set<() => void>();
const documents: ListedDocument[] = [];
let userConfig: UserConfigNote | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function createTestUserConfig(): UserConfigNote {
  return createUserConfigRootNote(documents, {
    createDocument: async (position, title) => {
      void position;
      return { id: createUniqueNoteId(), title };
    },
    onChange: notifyListeners,
  });
}

function ensureTestUserConfig(): UserConfigNote {
  userConfig ??= createTestUserConfig();
  return userConfig;
}

export function resetTestUserConfig(): void {
  documents.splice(0, documents.length, DEFAULT_USER_DOCUMENT);
  userConfig = null;
  notifyListeners();
}

function startTestUserConfigRuntime(): void {
  if (userConfig) {
    return;
  }
  ensureTestUserConfig();
  notifyListeners();
}

function subscribeTestUserConfigRuntime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCurrentTestUserConfig(): UserConfigNote | null {
  return userConfig;
}

export function getTestUserConfig(): Promise<UserConfigNote> {
  return Promise.resolve(ensureTestUserConfig());
}

function useTestUserConfigRoot(): UserConfigNote | null {
  const currentUserConfig = useSyncExternalStore(
    subscribeTestUserConfigRuntime,
    getCurrentTestUserConfig,
    getCurrentTestUserConfig,
  );

  useEffect(() => {
    startTestUserConfigRuntime();
  }, []);

  return currentUserConfig;
}

export function mockUserConfigModule() {
  return {
    useUserConfigRoot: useTestUserConfigRoot,
  };
}

resetTestUserConfig();
