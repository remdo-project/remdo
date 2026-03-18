import type { DocumentNote } from '@/documents/contracts';
import type { EditorNote } from '@/editor/notes/contracts';
import type { NoteId } from '@/notes/contracts';

type DocumentId = string;
type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface NoteRange {
  start: NoteId;
  end: NoteId;
}

export type PlaceTarget = { parent: NoteId; index: number } | { before: NoteId } | { after: NoteId };

type SelectionWithRangeKind = Exclude<NoteSelectionKind, 'none'>;

export type SelectionSnapshot =
  | { kind: 'none'; range: null }
  | { kind: SelectionWithRangeKind; range: NoteRange };

export type NoteSelection = SelectionSnapshot;
export type AdapterNoteSelection = NoteSelection;

interface EditorNotesBase {
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

export interface EditorNotes extends EditorNotesBase {
  /** Returns current document note handle. */
  currentDocument: () => DocumentNote;
  /** Creates and places an editor note at target, then returns attached note handle. */
  createNote: (target: PlaceTarget, text?: string) => EditorNote;
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
  /** Reads direct child ids. Throws when note does not exist. */
  childrenOf: (noteId: NoteId) => readonly NoteId[];
}
