// TODO: Remove this local-only user-config backend once tests no longer rely on COLLAB_ENABLED=false.
import { createUniqueNoteId } from '#lib/editor/note-ids';
import type { UserConfigNote } from './contracts';
import { DEFAULT_USER_DOCUMENT } from './defaults';
import { createUserConfigRootNote } from './user-config-notes';
import type { ListedDocument } from './user-config-notes';

let localUserDocuments: ListedDocument[] | null = null;

export function getUserConfig(): Promise<UserConfigNote> {
  const documents = getLocalUserDocuments();
  return Promise.resolve(createUserConfigRootNote(documents, {
    createDocument: async (position, title) => {
      void position;
      return { id: createUniqueNoteId(), title };
    },
  }));
}

function getLocalUserDocuments(): ListedDocument[] {
  if (!localUserDocuments) {
    localUserDocuments = [DEFAULT_USER_DOCUMENT];
  }
  return localUserDocuments;
}
