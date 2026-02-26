export type NoteId = string;
type DocumentId = string;
type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface Note {
  /** Stable id for an attached note. */
  id: () => NoteId;
  /** True when the note still exists in the current editor state. */
  attached: () => boolean;
  /** Returns current note text. Throws when note does not exist. */
  text: () => string;
  /** Returns direct child notes. Throws when note does not exist. */
  children: () => readonly Note[];
}

export interface NoteRange {
  start: NoteId;
  end: NoteId;
}

export type PlaceTarget = { parent: NoteId; index: number } | { before: NoteId } | { after: NoteId };

interface NoteSdkBase {
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

type SelectionWithRangeKind = Exclude<NoteSelectionKind, 'none'>;

export type SelectionSnapshot =
  | { kind: 'none'; range: null }
  | { kind: SelectionWithRangeKind; range: NoteRange };

export type NoteSelection = SelectionSnapshot;
export type AdapterNoteSelection = NoteSelection;

export interface NoteSdk extends NoteSdkBase {
  /** Creates and places a note at target, then returns the created attached note handle. */
  createNote: (target: PlaceTarget, text?: string) => Note;
  /** Returns a note handle by id; reads throw when the note does not exist. */
  note: (noteId: NoteId) => Note;
}

export interface NoteSdkAdapter extends NoteSdkBase {
  /** Creates and places an adapter-level note at target, then returns attached note id. */
  createNote: (target: PlaceTarget, text?: string) => NoteId;
  /** True when note id exists (bounded). */
  hasNote: (noteId: NoteId) => boolean;
  /** True when note id resolves to currently attached note. */
  isBounded: (noteId: NoteId) => boolean;
  /** Reads note text. Throws when note does not exist. */
  textOf: (noteId: NoteId) => string;
  /** Reads direct child ids. Throws when note does not exist. */
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
