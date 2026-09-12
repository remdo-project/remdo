import type { ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import type { DocumentSession } from '#note-sdk';
import { areNotePathsEqual } from '#client/editor/outline/note-traversal';
import type { NotePathItem } from '#client/editor/outline/note-traversal';

export interface EditorViewBindings {
  zoomNoteId?: string | null;
}

const missingEditorViewContextError = new Error(
  'Editor view context is missing. Wrap the route/editor shell in <EditorViewProvider>.'
);
const EMPTY_PATH: NotePathItem[] = [];

const EditorViewContext = createContext<{
  zoomNoteId: string | null;
  zoomPath: NotePathItem[];
  requestZoomNoteId: (noteId: string | null) => void;
  setZoomPath: (path: NotePathItem[]) => void;
  documentSession: DocumentSession | null;
  registerDocumentSession: (session: DocumentSession) => () => void;
} | null>(null);

export function EditorViewProvider({
  children,
  docId,
  zoomNoteId = null,
  onZoomNoteIdChange,
}: EditorViewBindings & {
  children: ReactNode;
  docId: string;
  onZoomNoteIdChange: (noteId: string | null) => void;
}) {
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
    onZoomNoteIdChangeRef.current(noteId);
  }, []);

  const [registeredDocumentSession, setRegisteredDocumentSession] = useState<DocumentSession | null>(null);
  const registerDocumentSession = useCallback((session: DocumentSession) => {
    setRegisteredDocumentSession(session);
    return () => {
      setRegisteredDocumentSession((current) => current === session ? null : current);
    };
  }, []);
  const documentSession = registeredDocumentSession?.documentId === docId
    ? registeredDocumentSession
    : null;

  const value = useMemo(() => ({
    zoomNoteId,
    zoomPath,
    requestZoomNoteId,
    setZoomPath,
    documentSession,
    registerDocumentSession,
  }), [documentSession, registerDocumentSession, requestZoomNoteId, setZoomPath, zoomNoteId, zoomPath]);

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
export function useRegisterDocumentSession() {
  const context = useEditorViewContext();
  return context.registerDocumentSession;
}

// eslint-disable-next-line react-refresh/only-export-components -- Safe: hook reads provider-owned editor view state.
export function useDocumentSession(): DocumentSession | null {
  const context = useEditorViewContext();
  return context.documentSession;
}
