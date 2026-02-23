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
  delete: (notes: readonly Note[]) => boolean;
  indent: (notes: readonly Note[]) => boolean;
  outdent: (notes: readonly Note[]) => boolean;
  moveUp: (notes: readonly Note[]) => boolean;
  moveDown: (notes: readonly Note[]) => boolean;
}

export type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export type NoteSelectionVariant =
  | { kind: 'none' }
  | { kind: 'caret' }
  | { kind: 'inline' }
  | { kind: 'structural' };

export interface NoteSelectionApi {
  as: <K extends NoteSelectionKind>(kind: K) => NoteSelectionByKind<K>;
  heads: () => readonly Note[];
}

export type NoteSelectionByKind<K extends NoteSelectionKind = NoteSelectionKind> = Extract<
  NoteSelectionVariant,
  { kind: K }
> &
  NoteSelectionApi;

export type NoteSelection = NoteSelectionByKind;

export type AdapterNoteSelection =
  | { kind: 'none'; headIds: readonly [] }
  | { kind: 'caret'; headIds: readonly [NoteId] }
  | { kind: 'inline'; headIds: readonly [NoteId] }
  | { kind: 'structural'; headIds: readonly NoteId[] };

export interface NoteSdkAdapter {
  docId: () => DocumentId;
  adapterSelection: () => AdapterNoteSelection;
  hasNote: (noteId: NoteId) => boolean;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
  deleteNotes: (noteIds: readonly NoteId[]) => boolean;
  indentNotes: (noteIds: readonly NoteId[]) => boolean;
  outdentNotes: (noteIds: readonly NoteId[]) => boolean;
  moveNotesUp: (noteIds: readonly NoteId[]) => boolean;
  moveNotesDown: (noteIds: readonly NoteId[]) => boolean;
}
