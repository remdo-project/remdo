import type { AdapterNoteSelection, EditorNotes, EditorNotesAdapter } from '@/editor/notes/sdk-contracts';
import { createEditorNotes } from './createEditorNotes';
import type { NoteId, NoteKind } from '@/notes/contracts';
import { NoteNotFoundError } from '@/notes/errors';

interface UserConfigRecord {
  kind: NoteKind;
  text: string;
  children: readonly NoteId[];
}

interface HardcodedUserConfigAdapter {
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

const noSelection: AdapterNoteSelection = { kind: 'none', range: null };

export function createHardcodedUserConfigNoteSdk(): EditorNotes {
  const userConfig = createHardcodedUserConfigAdapter();
  const adapter: EditorNotesAdapter = {
    docId: () => MAIN_DOCUMENT_ID,
    currentDocumentChildrenIds: () => [],
    userConfigId: () => userConfig.userConfigId(),
    hasUserConfigNote: (noteId) => userConfig.hasUserConfigNote(noteId),
    userConfigKindOf: (noteId) => userConfig.userConfigKindOf(noteId),
    userConfigTextOf: (noteId) => userConfig.userConfigTextOf(noteId),
    userConfigChildrenOf: (noteId) => userConfig.userConfigChildrenOf(noteId),
    selection: () => noSelection,
    createNote: () => {
      throw new Error('createNote is not supported by hardcoded user-config sdk.');
    },
    hasNote: () => false,
    isBounded: () => false,
    textOf: (noteId) => {
      throw new NoteNotFoundError(noteId);
    },
    childrenOf: (noteId) => {
      throw new NoteNotFoundError(noteId);
    },
    delete: () => false,
    place: () => {
      throw new Error('place is not supported by hardcoded user-config sdk.');
    },
    indent: () => false,
    outdent: () => false,
    moveUp: () => false,
    moveDown: () => false,
  };
  return createEditorNotes(adapter);
}
