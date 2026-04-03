// TODO: Remove this local-only user-config backend once tests no longer rely on COLLAB_ENABLED=false.
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { UserConfigNote } from './contracts';
import { DEFAULT_USER_DOCUMENT } from './defaults';
import { createUserConfigRootNote } from './user-config-notes';
import type { ListedDocument } from './user-config-notes';

const listeners = new Set<() => void>();
const documents: ListedDocument[] = [DEFAULT_USER_DOCUMENT];
let userConfig: UserConfigNote | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function createMemoryUserConfig(): UserConfigNote {
  return createUserConfigRootNote(documents, {
    createDocument: async (position, title) => {
      void position;
      return { id: createUniqueNoteId(), title };
    },
    onChange: notifyListeners,
  });
}

function ensureUserConfig(): UserConfigNote {
  userConfig ??= createMemoryUserConfig();
  return userConfig;
}

export function startUserConfigRuntime(): void {
  if (userConfig) {
    return;
  }
  ensureUserConfig();
  notifyListeners();
}

export function subscribeUserConfigRuntime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentUserConfig(): UserConfigNote | null {
  return userConfig;
}

export function getUserConfig(): Promise<UserConfigNote> {
  return Promise.resolve(ensureUserConfig());
}
