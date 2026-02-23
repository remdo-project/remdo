export type NoteId = string;
// TODO(sdk): Revisit whether `DocumentId` should remain distinct once SDK models documents as notes.
export type DocumentId = string;

export interface Note {
  id: () => NoteId;
  text: () => string;
  children: () => readonly Note[];
  indent: () => boolean;
  outdent: () => boolean;
  moveUp: () => boolean;
  moveDown: () => boolean;
}

export interface NoteSdk {
  docId: () => DocumentId;
  selection: () => NoteSelection;
  get: (noteId: NoteId) => Note;
}

export type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export type NoteSelectionVariant =
  | { kind: 'none' }
  | { kind: 'caret'; note: Note }
  | { kind: 'inline'; note: Note }
  | { kind: 'structural'; heads: readonly Note[] };

export interface NoteSelectionApi {
  as: <K extends NoteSelectionKind>(kind: K) => NoteSelectionByKind<K>;
}

export type NoteSelectionByKind<K extends NoteSelectionKind = NoteSelectionKind> = Extract<
  NoteSelectionVariant,
  { kind: K }
> &
  NoteSelectionApi;

export type NoteSelection = NoteSelectionByKind;

export type AdapterNoteSelection =
  | { kind: 'none' }
  | { kind: 'caret'; noteId: NoteId }
  | { kind: 'inline'; noteId: NoteId }
  | { kind: 'structural'; headIds: readonly NoteId[] };

export interface NoteSdkAdapter {
  docId: () => DocumentId;
  adapterSelection: () => AdapterNoteSelection;
  hasNote: (noteId: NoteId) => boolean;
  textOf: (noteId: NoteId) => string | null;
  childrenOf: (noteId: NoteId) => readonly NoteId[] | null;
  indent: (noteId: NoteId) => boolean;
  outdent: (noteId: NoteId) => boolean;
  moveUp: (noteId: NoteId) => boolean;
  moveDown: (noteId: NoteId) => boolean;
}
