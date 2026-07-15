import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';
import { setZoomRoot } from './zoom-root';
import type { UpdateListenerPayload } from 'lexical';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { useCollaborationStatus } from '#client/editor/plugins/collaboration/CollaborationProvider';
import { $findNoteById, $getNoteAncestorPath, areNotePathsEqual } from '#client/editor/outline/note-traversal';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import { isContentDescendantOf } from '#client/editor/outline/selection/tree';
import { ZOOM_TO_NOTE_COMMAND } from '#client/editor/commands';
import { resolveZoomNoteId } from './zoom-note-id';
import { ZOOM_CARET_TAG, ZOOM_INIT_TAG } from '#client/editor/update-tags';
import { useEditorViewActions, useZoomNoteId } from '#client/editor/view/EditorViewProvider';
import { $placeCaretAtZoomEntry, $placeCaretAtZoomEntryIfOutside } from './zoom-caret';
import { useZoomBulletInteractions } from './useZoomBulletInteractions';

const EMPTY_ZOOM_STATE = {
  root: null,
  path: [] as NotePathItem[],
  zoomRootKey: null as string | null,
  selectionInZoomRoot: false,
};

export function ZoomPlugin() {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();
  const zoomNoteId = useZoomNoteId();
  const { requestZoomNoteId, setZoomPath } = useEditorViewActions();
  const lastPathRef = useRef<NotePathItem[] | null>(null);
  const zoomNoteIdRef = useRef(resolveZoomNoteId(zoomNoteId));
  const skipZoomSelectionRef = useRef(false);
  const pendingZoomSelectionRef = useRef<string | null>(null);
  const pendingZoomSelectionTaskRef = useRef(false);
  const pendingZoomSelectionNonceRef = useRef(0);

  useZoomBulletInteractions(editor);

  useEffect(() => {
    zoomNoteIdRef.current = resolveZoomNoteId(zoomNoteId);
    const noteId = zoomNoteIdRef.current;
    if (!noteId) {
      setZoomRoot(editor, null);
      return;
    }

    let zoomRootKey: string | null = null;
    editor.getEditorState().read(() => {
      const root = $findNoteById(noteId);
      if (!root) {
        return;
      }
      zoomRootKey = root.getKey();
    });
    setZoomRoot(editor, zoomRootKey);
  }, [editor, zoomNoteId]);

  useEffect(() => {
    return editor.registerCommand(
      ZOOM_TO_NOTE_COMMAND,
      ({ noteId }) => {
        if (!noteId) {
          return false;
        }
        if (zoomNoteIdRef.current === noteId) {
          editor.focus();
          return true;
        }
        const zoomRoot = $findNoteById(noteId);
        if (!zoomRoot || $placeCaretAtZoomEntry(noteId) === 'missing') {
          return false;
        }
        requestZoomNoteId(noteId);
        // Publish the new zoom root synchronously: the React effects that
        // normally maintain it land only after the next commit, and a keypress
        // in between (e.g. Backspace right after a bullet click) must already
        // see the new boundary.
        zoomNoteIdRef.current = resolveZoomNoteId(noteId);
        setZoomRoot(editor, zoomRoot.getKey());
        editor.focus();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, requestZoomNoteId]);

  useEffect(() => {
    const handleUpdate = ({
      editorState,
      tags,
    }: UpdateListenerPayload) => {
      const noteId = zoomNoteIdRef.current;
      const isZoomInit = tags.has(ZOOM_INIT_TAG);

      const resolved = editorState.read(() => {
        const selection = $getSelection();
        const selectionItem = $isRangeSelection(selection)
          ? resolveContentItemFromNode(selection.anchor.getNode())
          : null;
        if (!noteId) {
          return EMPTY_ZOOM_STATE;
        }

        const root = $findNoteById(noteId);
        if (!root) {
          return EMPTY_ZOOM_STATE;
        }

        const selectionInZoomRoot = selectionItem ? isContentDescendantOf(selectionItem, root) : false;
        return {
          root,
          path: $getNoteAncestorPath(root),
          zoomRootKey: root.getKey(),
          selectionInZoomRoot,
        };
      });

      setZoomRoot(editor, resolved.zoomRootKey ?? null);

      if (!areNotePathsEqual(resolved.path, lastPathRef.current)) {
        lastPathRef.current = resolved.path;
        setZoomPath(resolved.path);
      }

      if (zoomNoteIdRef.current && !resolved.root && collab.hydrated && !isZoomInit) {
        pendingZoomSelectionRef.current = null;
        pendingZoomSelectionTaskRef.current = false;
        pendingZoomSelectionNonceRef.current += 1;
        skipZoomSelectionRef.current = true;
        requestZoomNoteId(null);
        return;
      }

      const pendingZoomSelection = pendingZoomSelectionRef.current;
      if (pendingZoomSelection && pendingZoomSelection === noteId && resolved.root) {
        if (resolved.selectionInZoomRoot) {
          pendingZoomSelectionRef.current = null;
        } else if (!pendingZoomSelectionTaskRef.current) {
          pendingZoomSelectionRef.current = null;
          const pendingToken = pendingZoomSelectionNonceRef.current;
          pendingZoomSelectionTaskRef.current = true;
          queueMicrotask(() => {
            pendingZoomSelectionTaskRef.current = false;
            if (pendingZoomSelectionNonceRef.current !== pendingToken) {
              return;
            }
            editor.update(() => {
              if (zoomNoteIdRef.current !== noteId) {
                return;
              }
              const result = $placeCaretAtZoomEntryIfOutside(noteId);
              pendingZoomSelectionRef.current = result === 'missing' ? noteId : null;
            }, { tag: ZOOM_CARET_TAG });
          });
        }
      }
    };

    const unregister = editor.registerUpdateListener(handleUpdate);
    handleUpdate({
      editorState: editor.getEditorState(),
      prevEditorState: editor.getEditorState(),
      mutatedNodes: null,
      normalizedNodes: new Set(),
      dirtyElements: new Map(),
      dirtyLeaves: new Set(),
      tags: new Set([ZOOM_INIT_TAG]),
    });

    return () => unregister();
  }, [collab.hydrated, editor, requestZoomNoteId, setZoomPath]);

  useEffect(() => {
    if (skipZoomSelectionRef.current) {
      skipZoomSelectionRef.current = false;
      pendingZoomSelectionRef.current = null;
      pendingZoomSelectionTaskRef.current = false;
      pendingZoomSelectionNonceRef.current += 1;
      return;
    }

    const noteId = resolveZoomNoteId(zoomNoteId);
    pendingZoomSelectionRef.current = null;
    if (!noteId) {
      pendingZoomSelectionTaskRef.current = false;
      pendingZoomSelectionNonceRef.current += 1;
      return;
    }

    const hasRoot = editor.getEditorState().read(() => Boolean($findNoteById(noteId)));
    if (!hasRoot) {
      pendingZoomSelectionRef.current = noteId;
      return;
    }

    editor.update(() => {
      if ($placeCaretAtZoomEntry(noteId) === 'missing') {
        pendingZoomSelectionRef.current = noteId;
        return;
      }
      pendingZoomSelectionRef.current = null;
    }, { tag: ZOOM_CARET_TAG });
  }, [editor, zoomNoteId]);

  return null;
}
