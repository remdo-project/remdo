export type NoteId = string;
// TODO(sdk): Revisit whether `DocumentId` should remain distinct once SDK models documents as notes.
export type DocumentId = string;

export type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface Note {
  id: () => NoteId;
  text: () => string;
  children: () => readonly Note[];
}

export interface NoteRange {
  start: NoteId;
  end: NoteId;
}

export type MoveTarget = { parent: NoteId; index: number } | { before: NoteId } | { after: NoteId };

export interface NoteSdkBase {
  docId: () => DocumentId;
  selection: () => SelectionSnapshot;
  delete: (range: NoteRange) => boolean;
  move: (range: NoteRange, target: MoveTarget) => boolean;
  indent: (range: NoteRange) => boolean;
  outdent: (range: NoteRange) => boolean;
  moveUp: (range: NoteRange) => boolean;
  moveDown: (range: NoteRange) => boolean;
}

export type SelectionWithRangeKind = Exclude<NoteSelectionKind, 'none'>;

export type SelectionSnapshot =
  | { kind: 'none'; range: null }
  | { kind: SelectionWithRangeKind; range: NoteRange };

export type NoteSelection = SelectionSnapshot;
export type AdapterNoteSelection = NoteSelection;

export interface NoteSdk extends NoteSdkBase {
  note: (noteId: NoteId) => Note;
}

export interface NoteSdkAdapter extends NoteSdkBase {
  hasNote: (noteId: NoteId) => boolean;
  textOf: (noteId: NoteId) => string;
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
