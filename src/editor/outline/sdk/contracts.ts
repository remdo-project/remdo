export type NoteId = string;
// TODO(sdk): Revisit whether `DocumentId` should remain distinct once SDK models documents as notes.
export type DocumentId = string;

export interface Note {
  id: () => NoteId;
  text: () => string;
  children: () => readonly Note[];
}

export interface NoteBatchOps<TRef> {
  delete: (items: readonly TRef[]) => boolean;
  indent: (items: readonly TRef[]) => boolean;
  outdent: (items: readonly TRef[]) => boolean;
  moveUp: (items: readonly TRef[]) => boolean;
  moveDown: (items: readonly TRef[]) => boolean;
}

export interface NoteSdk extends NoteBatchOps<Note> {
  docId: () => DocumentId;
  selection: () => NoteSelection;
  get: (noteId: NoteId) => Note;
}

export type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface SelectionSnapshot<TRef> {
  kind: NoteSelectionKind;
  heads: readonly TRef[];
}

export interface NoteSelectionApi {
  heads: () => readonly Note[];
}

export type NoteSelection = { kind: NoteSelectionKind } & NoteSelectionApi;

export type AdapterNoteSelection = SelectionSnapshot<NoteId>;

export interface NoteSdkAdapter extends NoteBatchOps<NoteId> {
  docId: () => DocumentId;
  adapterSelection: () => AdapterNoteSelection;
  hasNote: (noteId: NoteId) => boolean;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
