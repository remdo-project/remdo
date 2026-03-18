export type NoteId = string;
export type NoteKind =
  | 'editor-note'
  | 'user-config'
  | 'document-list'
  | 'document'
  | (string & {});

type DocumentId = string;
type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface Note<K extends NoteKind = NoteKind> {
  /** Stable id for a note. */
  id: () => NoteId;
  /** Runtime discriminator for note shape/role. */
  kind: () => K;
  /** Returns current note text. Throws when note does not exist. */
  text: () => string;
  /** Returns direct child notes. */
  children: () => readonly Note[];
}

export interface EditorNote extends Note<'editor-note'> {
  /** True when the note still exists in the current editor state. */
  attached: () => boolean;
  /** Returns direct child editor notes. Throws when note does not exist. */
  children: () => readonly EditorNote[];
}

export interface DocumentNote extends Note<'document'> {
  /** Returns direct document-root editor notes in display order. */
  children: () => readonly EditorNote[];
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
  /** Returns current document note handle. */
  currentDocument: () => DocumentNote;
  /** Returns user-config root note handle. */
  userConfig: () => Note;
  /** Creates and places an editor note at target, then returns attached note handle. */
  createNote: (target: PlaceTarget, text?: string) => EditorNote;
  /** Returns an editor note handle by id; reads throw when the note does not exist. */
  note: (noteId: NoteId) => EditorNote;
}

export interface NoteSdkAdapter extends NoteSdkBase {
  /** Reads direct current-document root editor note ids in display order. */
  currentDocumentChildrenIds: () => readonly NoteId[];
  /** Returns user-config root note id. */
  userConfigId: () => NoteId;
  /** True when user-config note id exists. */
  hasUserConfigNote: (noteId: NoteId) => boolean;
  /** Reads user-config note kind. Throws when user-config note does not exist. */
  userConfigKindOf: (noteId: NoteId) => NoteKind;
  /** Reads user-config note text. Throws when user-config note does not exist. */
  userConfigTextOf: (noteId: NoteId) => string;
  /** Reads direct user-config child ids. Throws when user-config note does not exist. */
  userConfigChildrenOf: (noteId: NoteId) => readonly NoteId[];
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
