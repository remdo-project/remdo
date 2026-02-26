export type NoteId = string;
// TODO(sdk): Revisit whether `DocumentId` should remain distinct once SDK models documents as notes.
export type DocumentId = string;

export type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface Note {
  /** Stable id for a bounded note. */
  id: () => NoteId;
  /** True when the note still exists in the current editor state. */
  bounded: () => boolean;
  /** Returns current note text. Throws when note does not exist. */
  text: () => string;
  /** Returns direct child notes. Throws when note does not exist. */
  children: () => readonly Note[];
}

export interface DraftNote {
  /** Places the draft and returns the created bounded note handle. Throws on invalid target or no-op placement. */
  place: (target: PlaceTarget) => Note;
}

export interface NoteRange {
  start: NoteId;
  end: NoteId;
}

export type PlaceTarget = { parent: NoteId; index: number } | { before: NoteId } | { after: NoteId };

export interface NoteSdkBase {
  /** Returns current document id for this sdk instance. */
  docId: () => DocumentId;
  /** Returns normalized selection snapshot; range is null only for kind:none. */
  selection: () => SelectionSnapshot;
  /** Deletes all notes in the sibling range; returns false for domain no-op. */
  delete: (range: NoteRange) => boolean;
  /** Re-places the sibling range at target; throws for invalid/no-op placement. */
  place: (range: NoteRange, target: PlaceTarget) => void;
  /** Indents notes in the sibling range; returns false for domain no-op. */
  indent: (range: NoteRange) => boolean;
  /** Outdents notes in the sibling range; returns false for domain no-op. */
  outdent: (range: NoteRange) => boolean;
  /** Moves range up among siblings; returns false for domain no-op. */
  moveUp: (range: NoteRange) => boolean;
  /** Moves range down among siblings; returns false for domain no-op. */
  moveDown: (range: NoteRange) => boolean;
}

export type SelectionWithRangeKind = Exclude<NoteSelectionKind, 'none'>;

export type SelectionSnapshot =
  | { kind: 'none'; range: null }
  | { kind: SelectionWithRangeKind; range: NoteRange };

export type NoteSelection = SelectionSnapshot;
export type AdapterNoteSelection = NoteSelection;

export interface NoteSdk extends NoteSdkBase {
  /** Creates an unbounded draft note with optional initial text. */
  createNote: (text?: string) => DraftNote;
  /** Returns a note handle by id; reads throw when the note does not exist. */
  note: (noteId: NoteId) => Note;
}

export interface AdapterDraftNote {
  /** Places the adapter draft and returns attached note id. Throws on failure. */
  place: (target: PlaceTarget) => NoteId;
}

export interface NoteSdkAdapter extends NoteSdkBase {
  /** Creates an adapter-level draft note with optional initial text. */
  createNote: (text?: string) => AdapterDraftNote;
  /** True when note id exists (bounded). */
  hasNote: (noteId: NoteId) => boolean;
  /** True when note id resolves to currently attached note. */
  isBounded: (noteId: NoteId) => boolean;
  /** Reads note text. Throws when note does not exist. */
  textOf: (noteId: NoteId) => string;
  /** Reads direct child ids. Throws when note does not exist. */
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
