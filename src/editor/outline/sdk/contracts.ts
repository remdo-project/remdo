export type NoteId = string;
// TODO(sdk): Revisit whether `DocumentId` should remain distinct once SDK models documents as notes.
export type DocumentId = string;

export interface Note {
  id: () => NoteId;
  text: () => string;
  children: () => readonly Note[];
}

export type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface SelectionSnapshot<TRef> {
  kind: NoteSelectionKind;
  heads: readonly TRef[];
}

export type MoveTarget<TRef> = { parent: TRef; index: number } | { before: TRef } | { after: TRef };

export interface NoteSdkBase<TRef> {
  docId: () => DocumentId;
  selection: () => SelectionSnapshot<TRef>;
  delete: (items: readonly TRef[]) => boolean;
  move: (items: readonly TRef[], target: MoveTarget<TRef>) => boolean;
  indent: (items: readonly TRef[]) => boolean;
  outdent: (items: readonly TRef[]) => boolean;
  moveUp: (items: readonly TRef[]) => boolean;
  moveDown: (items: readonly TRef[]) => boolean;
}

export interface NoteSdk extends NoteSdkBase<Note> {
  get: (noteId: NoteId) => Note;
}

export type NoteSelection = SelectionSnapshot<Note>;

export type AdapterNoteSelection = SelectionSnapshot<NoteId>;

export interface NoteSdkAdapter extends NoteSdkBase<NoteId> {
  hasNote: (noteId: NoteId) => boolean;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
