import type { DocumentNote } from './documents';
import type { AddressableNote, ChildPosition, Note, NoteId, RelativePlacement } from './notes';

type DocumentId = string;
type NoteSelectionKind = 'none' | 'caret' | 'inline' | 'structural';

export interface EditorNote extends AddressableNote<'editor-note'> {
  /** True when the note still exists in the current editor state. */
  attached: () => boolean;
  /** Returns direct child editor notes. Throws when the note does not exist. */
  children: () => readonly EditorNote[];
  /** Creates and places a child editor note relative to this note. */
  create: {
    (text: string): EditorNote;
    (position: ChildPosition, text: string): EditorNote;
  };
  /** Returns this note's body, or null when it has none. */
  body: () => BodyNote | null;
}

/**
 * A note's optional rich-text region. A body is a kind of note owned by its
 * editor note, but a restricted one: it has no id, no children, and is reached
 * only from its owning note (never through that note's children). See
 * `docs/outliner/body.md`.
 */
export interface BodyNote extends Note<'body'> {
  /** Returns the body's text. */
  text: () => string;
  /** A body has no child notes. */
  children: () => readonly never[];
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
  /** Reads direct child ids. Throws when note does not exist. */
  childrenOf: (noteId: NoteId) => readonly NoteId[];
  /** Reads the note's body text, or null when it has no body. */
  bodyTextOf: (noteId: NoteId) => string | null;
}
