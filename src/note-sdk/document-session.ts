import type { NoteId } from './notes';

/** Marker style owned by the list containing an editor note. */
export type NoteListType = 'bullet' | 'number' | 'check';

export type LoadState<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; data: T }>
  | Readonly<{ status: 'error'; error: unknown }>;

/** A synchronously readable cached observable value. */
export interface SnapshotStore<T> {
  getSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
}

/** Immutable parent-owned child order and presentation. */
export interface ChildListSnapshot {
  readonly listType: NoteListType;
  readonly noteIds: readonly NoteId[];
}

/** Immutable note data from one coherent document revision. */
export interface EditorNoteSnapshot {
  readonly id: NoteId;
  readonly text: string;
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

/** Current semantic capabilities used by high-level action surfaces. */
export interface DocumentCapabilitiesSnapshot {
  readonly focus: Readonly<{
    canToggleFold: boolean;
  }>;
  readonly selection: Readonly<{
    canDelete: boolean;
  }>;
  readonly history: Readonly<{
    canUndo: boolean;
    canRedo: boolean;
  }>;
}

/** A live, stable-ID handle for one editor note in the open document. */
export interface OpenDocumentNote {
  /** Stable ID used to re-resolve the note in the current document revision. */
  readonly id: () => NoteId;
  /** Returns the current content text; throws when the note is absent. */
  readonly text: () => string;
  /** Returns the current stored fold state; throws when the note is absent. */
  readonly folded: () => boolean;
  /** Revalidates the note and resolves after any local fold update commits. */
  readonly toggleFold: () => Promise<void>;
  /** Notifies only when this note's exposed values or existence may have changed. */
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * RemDo's adapter-neutral API for one open document. Framework transactions,
 * commands, storage keys, and observation mechanics stay behind its adapter.
 */
export interface DocumentSession {
  readonly documentId: string;
  readonly capabilities: SnapshotStore<LoadState<DocumentCapabilitiesSnapshot>>;

  /** Searches current committed data; rejects when the source cannot be read. */
  readonly search: (options: DocumentSearchOptions) => Promise<DocumentSearchResults>;
  /** Returns a live handle that re-resolves the stable note ID on each access. */
  readonly note: (noteId: NoteId) => OpenDocumentNote;
  readonly view: {
    foldToLevel: (level: number) => void;
  };
  readonly focus: {
    /** Resolves the current focus at execution and no-ops when folding is unavailable. */
    toggleFold: () => void;
  };
  readonly selection: {
    indent: () => void;
    outdent: () => void;
    moveUp: () => void;
    moveDown: () => void;
    toggleChecked: () => void;
    delete: () => void;
  };
  readonly history: {
    undo: () => void;
    redo: () => void;
  };
}
