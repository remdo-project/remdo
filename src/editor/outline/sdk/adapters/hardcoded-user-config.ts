import type { NoteId, NoteKind } from '../contracts';
import { NoteNotFoundError } from '../errors';

interface UserConfigRecord {
  kind: NoteKind;
  text: string;
  children: readonly NoteId[];
}

export interface HardcodedUserConfigAdapter {
  userConfigId: () => NoteId;
  hasUserConfigNote: (noteId: NoteId) => boolean;
  userConfigKindOf: (noteId: NoteId) => NoteKind;
  userConfigTextOf: (noteId: NoteId) => string;
  userConfigChildrenOf: (noteId: NoteId) => readonly NoteId[];
}

const USER_CONFIG_ROOT_ID = 'user-config';
const DOCUMENT_LIST_ID = 'user-config-document-list';
const MAIN_DOCUMENT_ID = 'main';
const PROJECT_DOCUMENT_ID = 'project';
const BASIC_DOCUMENT_ID = 'basic';
const FLAT_DOCUMENT_ID = 'flat';

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

export function createHardcodedUserConfigAdapter(): HardcodedUserConfigAdapter {
  return {
    userConfigId: () => USER_CONFIG_ROOT_ID,
    hasUserConfigNote: (noteId) => userConfigRecords.has(noteId),
    userConfigKindOf: (noteId) => requireRecord(noteId).kind,
    userConfigTextOf: (noteId) => requireRecord(noteId).text,
    userConfigChildrenOf: (noteId) => requireRecord(noteId).children,
  };
}
