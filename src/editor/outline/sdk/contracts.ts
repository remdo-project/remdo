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

export type SelectionSnapshot<TRef> =
  | { kind: 'none'; heads: readonly [] }
  | { kind: 'caret'; heads: readonly [TRef] }
  | { kind: 'inline'; heads: readonly [TRef] }
  | { kind: 'structural'; heads: readonly TRef[] };

export interface NoteSelectionApi {
  as: {
    (kind: 'none'): NoteSelection & { kind: 'none' };
    (kind: 'caret'): NoteSelection & { kind: 'caret' };
    (kind: 'inline'): NoteSelection & { kind: 'inline' };
    (kind: 'structural'): NoteSelection & { kind: 'structural' };
  };
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
