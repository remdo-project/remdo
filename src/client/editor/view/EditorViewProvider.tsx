import type { ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import { areNotePathsEqual } from '#client/editor/outline/note-traversal';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import type { EditorNotes } from '#note-sdk';

export interface EditorViewBindings {
  zoomNoteId?: string | null;
  onZoomNoteIdChange?: (noteId: string | null) => void;
}

/** Runs `fn` against the live editor's SDK notes inside an editor read. Returns
 *  null before the editor has registered (no document ready). Re-created on each
 *  editor edit so consumers recompute by identity. */
export type SearchNotesReader = <T>(fn: (notes: EditorNotes) => T) => T | null;

const NULL_SEARCH_NOTES_READER: SearchNotesReader = () => null;

const missingEditorViewContextError = new Error(
  'Editor view context is missing. Wrap the route/editor shell in <EditorViewProvider>.'
);
const EMPTY_PATH: NotePathItem[] = [];

const EditorViewContext = createContext<{
  zoomNoteId: string | null;
  zoomPath: NotePathItem[];
  requestZoomNoteId: (noteId: string | null) => void;
  setZoomPath: (path: NotePathItem[]) => void;
  searchNotes: SearchNotesReader;
  registerSearchNotesReader: (reader: SearchNotesReader | null) => void;
} | null>(null);

export function EditorViewProvider({
  children,
  docId,
  zoomNoteId = null,
  onZoomNoteIdChange,
}: EditorViewBindings & { children: ReactNode; docId: string }) {
  const [zoomPathState, setZoomPathState] = useState({
    sourceDocId: docId,
    path: EMPTY_PATH,
  });
  const zoomPath = zoomPathState.sourceDocId === docId &&
    zoomNoteId !== null &&
    zoomPathState.path.at(-1)?.noteId === zoomNoteId
    ? zoomPathState.path
    : EMPTY_PATH;
  const zoomPathRef = useRef(zoomPath);
  const onZoomNoteIdChangeRef = useRef(onZoomNoteIdChange);
  zoomPathRef.current = zoomPath;
  onZoomNoteIdChangeRef.current = onZoomNoteIdChange;

  const setZoomPath = useCallback((path: NotePathItem[]) => {
    if (areNotePathsEqual(path, zoomPathRef.current)) {
      return;
    }
    zoomPathRef.current = path;
    setZoomPathState({ path, sourceDocId: docId });
  }, [docId]);

  const requestZoomNoteId = useCallback((noteId: string | null) => {
    onZoomNoteIdChangeRef.current?.(noteId);
  }, []);

  // The editor (inside the composer) registers a reader bound to its live state;
  // the route reads search candidates through it. The plugin re-registers on each
  // editor edit, giving a fresh reader identity, so consumers recompute — the
  // "read once per edit" refresh the snapshot used to provide, without a
  // materialized snapshot. A reader bound to unchanged state is wrapped fresh so
  // its identity still changes.
  const [searchNotes, setSearchNotes] = useState<SearchNotesReader>(() => NULL_SEARCH_NOTES_READER);
  const registerSearchNotesReader = useCallback((reader: SearchNotesReader | null) => {
    // Wrap so each registration yields a fresh reader identity (consumers
    // recompute by identity), even when the plugin re-registers the same reader.
    const next = reader ?? NULL_SEARCH_NOTES_READER;
    const fresh: SearchNotesReader = (fn) => next(fn);
    setSearchNotes(() => fresh);
  }, []);

  const value = useMemo(() => ({
    zoomNoteId,
    zoomPath,
    requestZoomNoteId,
    setZoomPath,
    searchNotes,
    registerSearchNotesReader,
  }), [registerSearchNotesReader, requestZoomNoteId, searchNotes, setZoomPath, zoomNoteId, zoomPath]);

  return (
    <EditorViewContext value={value}>{children}</EditorViewContext>
  );
}

function useEditorViewContext() {
  const context = use(EditorViewContext);
  if (!context) {
    throw missingEditorViewContextError;
  }
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads provider-owned editor view state.
export function useZoomNoteId(): string | null {
  const context = useEditorViewContext();
  return context.zoomNoteId;
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads provider-owned editor view state.
export function useZoomPath(): NotePathItem[] {
  const context = useEditorViewContext();
  return context.zoomPath;
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook exposes provider-owned editor view state.
export function useEditorViewActions() {
  const context = useEditorViewContext();
  return {
    requestZoomNoteId: context.requestZoomNoteId,
    setZoomPath: context.setZoomPath,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook exposes provider-owned editor view state.
export function useRegisterSearchNotesReader() {
  const context = useEditorViewContext();
  return context.registerSearchNotesReader;
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads provider-owned editor view state.
export function useSearchNotes(): SearchNotesReader {
  const context = useEditorViewContext();
  return context.searchNotes;
}
