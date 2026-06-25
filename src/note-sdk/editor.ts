import type { DocumentNote } from './documents';
import type { ChildPosition, Note, NoteId, RelativePlacement } from './notes';

type DocumentId = string;
type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

/** Marker style of the list a note belongs to. */
export type NoteListType = 'bullet' | 'number' | 'check';

export interface EditorNote extends Note<'editor-note'> {
  /** True when the note still exists in the current editor state. */
  attached: () => boolean;
  /** Returns the parent editor note, or null for a top-level note. */
  parent: () => EditorNote | null;
  /** Returns direct child editor notes. Throws when the note does not exist. */
  children: () => readonly EditorNote[];
  /** Marker style of the list this note belongs to. */
  listType: () => NoteListType;
  /** Checked state; relevant only when listType is 'check' (false otherwise). */
  checked: () => boolean;
  /** Creates and places a child editor note relative to this note. */
  create: {
    (text: string): EditorNote;
    (position: ChildPosition, text: string): EditorNote;
  };
}

export interface NoteRange {
  start: NoteId;
  end: NoteId;
}

export type PlaceTarget = { parent: NoteId; index: number } | RelativePlacement;

type SelectionWithRangeKind = Exclude<NoteSelectionKind, 'none'>;

export type SelectionSnapshot =
  | { kind: 'none'; range: null }
  | { kind: SelectionWithRangeKind; range: NoteRange };

interface EditorNotesBase {
  /** Returns current document id for this editor-notes instance. */
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

export interface EditorNotes extends EditorNotesBase {
  /** Returns current document note handle. */
  currentDocument: () => DocumentNote;
  /** Returns an editor note handle by id; reads throw when the note does not exist. */
  note: (noteId: NoteId) => EditorNote;
}

export interface EditorNotesAdapter extends EditorNotesBase {
  /** Reads direct current-document root editor note ids in display order. */
  currentDocumentChildrenIds: () => readonly NoteId[];
  /** Creates and places an adapter-level note at target, then returns attached note id. */
  createNote: (target: PlaceTarget, text?: string) => NoteId;
  /** True when note id exists (bounded). */
  hasNote: (noteId: NoteId) => boolean;
  /** True when note id resolves to currently attached note. */
  isBounded: (noteId: NoteId) => boolean;
  /** Reads note text. Throws when note does not exist. */
  textOf: (noteId: NoteId) => string;
  /** Reads the marker style of the note's list. Throws when note does not exist. */
  listTypeOf: (noteId: NoteId) => NoteListType;
  /** Reads checked state (false unless the note is in a check list). Throws when note does not exist. */
  checkedOf: (noteId: NoteId) => boolean;
  /** Reads the parent note id, or null for a top-level note. Throws when note does not exist. */
  parentIdOf: (noteId: NoteId) => NoteId | null;
  /** Reads direct child ids. Throws when note does not exist. */
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
