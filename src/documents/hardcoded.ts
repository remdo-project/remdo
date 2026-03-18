import type { UserConfigSource } from '@/documents/contracts';
import type { NoteId, NoteKind } from '@/notes/contracts';
import { NoteNotFoundError } from '@/notes/errors';
import { createUserConfigRootNote } from './handles';

interface UserConfigRecord {
  kind: NoteKind;
  text: string;
  children: readonly NoteId[];
}

const USER_CONFIG_ROOT_ID = 'user-config';
const DOCUMENT_LIST_ID = 'user-config-document-list';
const MAIN_DOCUMENT_ID = 'main';
const PROJECT_DOCUMENT_ID = 'project';
const BASIC_DOCUMENT_ID = 'basic';
const FLAT_DOCUMENT_ID = 'flat';

export const HARDCODED_DEFAULT_DOCUMENT_ID = MAIN_DOCUMENT_ID;

const userConfigRecords = new Map<NoteId, UserConfigRecord>([
  [USER_CONFIG_ROOT_ID, { kind: 'user-config', text: 'User Config', children: [DOCUMENT_LIST_ID] }],
  [
    DOCUMENT_LIST_ID,
    { kind: 'document-list', text: 'Documents', children: [MAIN_DOCUMENT_ID, PROJECT_DOCUMENT_ID, BASIC_DOCUMENT_ID, FLAT_DOCUMENT_ID] },
  ],
  [MAIN_DOCUMENT_ID, { kind: 'document', text: 'Main', children: [] }],
  [PROJECT_DOCUMENT_ID, { kind: 'document', text: 'Project', children: [] }],
  [BASIC_DOCUMENT_ID, { kind: 'document', text: 'Basic', children: [] }],
  [FLAT_DOCUMENT_ID, { kind: 'document', text: 'Flat', children: [] }],
]);

const requireRecord = (noteId: NoteId): UserConfigRecord => {
  const record = userConfigRecords.get(noteId);
  if (!record) {
    throw new NoteNotFoundError(noteId);
  }
  return record;
};

function createHardcodedUserConfigSource(): UserConfigSource {
  return {
    rootId: () => USER_CONFIG_ROOT_ID,
    kindOf: (noteId) => requireRecord(noteId).kind,
    textOf: (noteId) => requireRecord(noteId).text,
    childrenOf: (noteId) => requireRecord(noteId).children,
  };
}

export function getUserConfig() {
  const userConfig = createHardcodedUserConfigSource();
  return createUserConfigRootNote(userConfig);
}
