import type { NoteId } from './notes';

/** Marker style owned by the list containing an editor note. */
export type NoteListType = 'bullet' | 'number' | 'check';

/** Immutable parent-owned child order and presentation. */
export interface ChildListSnapshot {
  readonly listType: NoteListType;
  readonly noteIds: readonly NoteId[];
}

/** Immutable note data from one coherent document revision. */
export interface EditorNoteSnapshot {
  readonly id: NoteId;
  readonly text: string;
  /** The note's body text, or null when it has none. Separate from `text`,
   *  which stays the note's own short label. */
  readonly body: string | null;
  readonly checked: boolean;
  readonly folded: boolean;
  readonly children: ChildListSnapshot | null;
}

/** A matching note plus its path (ancestors and self, self last). */
export interface SearchResult {
  note: EditorNoteSnapshot;
  childPreview: ChildPreview;
  path: readonly EditorNoteSnapshot[];
}

/** The first few direct children plus the exact direct-child count. */
export interface ChildPreview {
  notes: readonly EditorNoteSnapshot[];
  listType: NoteListType;
  totalCount: number;
}

export interface DocumentSearchResults {
  /** Matching notes in document order, capped at the requested limit. */
  flatResults: SearchResult[];
  /** True when at least one match exists beyond the returned results. */
  hasMore: boolean;
}

export interface DocumentSearchOptions {
  query: string;
  /** Maximum number of matching results to return. */
  limit: number;
  /** Maximum direct children to include in each result's preview. */
  childPreviewLimit: number;
}

/** One note to insert, with its descendants. */
export interface NewNote {
  /** Plain single-line text. */
  readonly text: string;
  readonly checked?: boolean;
  /** Type of the list holding `children`; defaults to the type of the list containing this note. */
  readonly childListType?: NoteListType;
  readonly children?: readonly NewNote[];
}

/** A note that holds editor notes: the document root or an editor note. */
export interface OpenDocumentParentNote {
  /** References to the current direct children in order. */
  readonly getChildren: () => readonly OpenDocumentNote[];
  /** Appends notes as the last children; resolves with their IDs in order. */
  readonly appendChildren: (notes: readonly NewNote[]) => Promise<NoteId[]>;
}

/**
 * A live, stable-ID reference to one editor note in the open document.
 * Value reads throw NoteUnavailableError when the note or source is unavailable.
 * Capability reads return false in those states; unexpected read failures propagate.
 * Operations reject with IneligibleOperationError when they cannot apply.
 */
export interface OpenDocumentNote extends OpenDocumentParentNote {
  /** Stable ID used to re-resolve the note in the current document revision. */
  readonly getId: () => NoteId;
  /** Returns the current content text. */
  readonly getText: () => string;
  /** Returns the current stored fold state. */
  readonly getFolded: () => boolean;
  readonly getChecked: () => boolean;
  /** The list owned by this note, or null for a leaf. */
  readonly getChildListType: () => NoteListType | null;
  readonly canToggleFold: () => boolean;
  readonly canToggleChecked: () => boolean;
  readonly canSetChildListType: () => boolean;
  /** Resolves after the local fold update commits. */
  readonly toggleFold: () => Promise<void>;
  /** Toggles only this note's subtree, independently of selection. */
  readonly toggleChecked: () => Promise<void>;
  /** Converts only this note's child list; rejects for a leaf. */
  readonly setChildListType: (listType: NoteListType) => Promise<void>;
  readonly zoom: () => void;
  /** Notifies when this note's exposed values, children, eligibility, or readability may have changed. */
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * RemDo's adapter-neutral API for one open document. Framework transactions,
 * commands, storage keys, and observation mechanics stay behind its adapter.
 * Current capability reads need no subscription and return false when the source
 * is unavailable. Unexpected read failures propagate.
 */
export interface DocumentSession {
  readonly documentId: string;
  /** Notifies when action eligibility, source availability, or read failures may have changed. */
  readonly subscribeCapabilities: (listener: () => void) => () => void;

  /** Searches current committed data; rejects when the source cannot be read. */
  readonly search: (options: DocumentSearchOptions) => Promise<DocumentSearchResults>;
  /** The document root, whose children are the top-level editor notes. */
  readonly document: OpenDocumentParentNote;
  /** Returns a live reference without checking existence or creating a note. */
  readonly noteRef: (noteId: NoteId) => OpenDocumentNote;
  readonly view: {
    zoomOut: () => void;
    /** Applies a level from 0 (unfold) through 9 within the current zoom boundary. */
    foldToLevel: (level: number) => void;
  };
  readonly focus: {
    canToggleFold: () => boolean;
    /** Resolves the current focus at execution and no-ops when folding is unavailable. */
    toggleFold: () => void;
  };
  readonly selection: {
    canDelete: () => boolean;
    indent: () => void;
    outdent: () => void;
    moveUp: () => void;
    moveDown: () => void;
    /**
     * Without a target, toggles the current selection. With a note ID, toggles
     * the selected range when it contains that note, otherwise its subtree.
     */
    toggleChecked: (target?: { noteId: NoteId }) => void;
    delete: () => void;
  };
  readonly history: {
    canUndo: () => boolean;
    canRedo: () => boolean;
    undo: () => void;
    redo: () => void;
  };
}
