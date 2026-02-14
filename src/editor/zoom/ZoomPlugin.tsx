import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import { isBulletHit, isCheckboxHit } from '@/editor/outline/bullet-hit-test';
import { setSelectionBoundary } from '@/editor/outline/selection/boundary';
import { setZoomScrollTarget } from '@/editor/zoom/scroll-target';
import { consumeZoomMergeHint } from '@/editor/zoom/zoom-change-hints';
import type { ListItemNode } from '@lexical/list';
import type { UpdateListenerPayload } from 'lexical';
import {
  $resolveContentNoteFromDOMNode,
  $resolveContentNoteFromNode,
  $resolveNoteIdFromDOMNode,
} from '@/editor/outline/note-context';
import { $requireContentItemNoteId } from '@/editor/outline/schema';
import { useCollaborationStatus } from '@/editor/plugins/collaboration/CollaborationProvider';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { $findNoteById, $getNoteAncestorPath } from '@/editor/outline/note-traversal';
import { findLowestCommonContentAncestor, getParentContentItem, isContentDescendantOf } from '@/editor/outline/selection/tree';
import { ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';
import { resolveZoomNoteId } from './zoom-note-id';
import {
  NOTE_ID_NORMALIZE_TAG,
  ROOT_SCHEMA_NORMALIZE_TAG,
  TEST_BRIDGE_LOAD_TAG,
  ZOOM_CARET_TAG,
  ZOOM_INIT_TAG,
} from '@/editor/update-tags';

interface ZoomPluginProps {
  zoomNoteId?: string | null;
  onZoomNoteIdChange?: (noteId: string | null) => void;
  onZoomPathChange?: (path: NotePathItem[]) => void;
}

const isPathEqual = (next: NotePathItem[], prev: NotePathItem[] | null) => {
  if (!prev || next.length !== prev.length) {
    return false;
  }
  return next.every((item, index) => {
    const prevItem = prev[index];
    if (!prevItem) {
      return false;
    }
    return item.noteId === prevItem.noteId && item.label === prevItem.label;
  });
};

const $collectDirtyContentItems = (
  dirtyElements: Map<string, boolean>,
  dirtyLeaves: Set<string>
): ListItemNode[] => {
  const items = new Map<string, ListItemNode>();

  const addItem = (item: ListItemNode | null) => {
    if (!item) {
      return;
    }
    items.set(item.getKey(), item);
  };

  for (const [key, intentional] of dirtyElements) {
    if (!intentional) {
      continue;
    }
    const node = $getNodeByKey(key);
    addItem($resolveContentNoteFromNode(node));
  }

  for (const key of dirtyLeaves) {
    const node = $getNodeByKey(key);
    addItem($resolveContentNoteFromNode(node));
  }

  return Array.from(items.values());
};

const resolveZoomAncestor = (root: ListItemNode, outsideItems: ListItemNode[]): ListItemNode | null => {
  let candidate: ListItemNode | null = null;
  for (const item of outsideItems) {
    const next: ListItemNode | null = candidate
      ? findLowestCommonContentAncestor(candidate, item)
      : findLowestCommonContentAncestor(root, item);
    if (!next) {
      return null;
    }
    candidate = next;
  }
  return candidate;
};

export function ZoomPlugin({ zoomNoteId, onZoomNoteIdChange, onZoomPathChange }: ZoomPluginProps) {
  const [editor] = useLexicalComposerContext();
  const collab = useCollaborationStatus();
  const lastPathRef = useRef<NotePathItem[] | null>(null);
  const zoomNoteIdRef = useRef<string | null>(resolveZoomNoteId(zoomNoteId));
  const lastBulletHoverRef = useRef<HTMLElement | null>(null);
  const lastCheckboxHoverRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(editor.getRootElement());
  const zoomParentTrackedRef = useRef(false);
  const zoomParentKeyRef = useRef<string | null>(null);
  const skipZoomSelectionRef = useRef(false);
  const pendingZoomSelectionRef = useRef<string | null>(null);
  const pendingZoomSelectionTaskRef = useRef(false);
  const pendingZoomSelectionNonceRef = useRef(0);
  const suppressPathUpdatesRef = useRef(false);
  const autoZoomReadyRef = useRef(false);

  useEffect(() => {
    zoomNoteIdRef.current = resolveZoomNoteId(zoomNoteId);
    suppressPathUpdatesRef.current = false;
    const noteId = zoomNoteIdRef.current;
    if (!noteId) {
      zoomParentTrackedRef.current = false;
      zoomParentKeyRef.current = null;
      setSelectionBoundary(editor, null);
      return;
    }

    let boundaryKey: string | null = null;
    editor.getEditorState().read(() => {
      const root = $findNoteById(noteId);
      if (!root) {
        zoomParentTrackedRef.current = false;
        zoomParentKeyRef.current = null;
        return;
      }
      const parent = getParentContentItem(root);
      zoomParentTrackedRef.current = true;
      zoomParentKeyRef.current = parent?.getKey() ?? null;
      boundaryKey = root.getKey();
    });
    setSelectionBoundary(editor, boundaryKey);
  }, [editor, zoomNoteId]);

  useEffect(() => {
    autoZoomReadyRef.current = collab.synced;
  }, [collab.synced, collab.docEpoch]);

  useEffect(() => {
    return editor.registerCommand(
      ZOOM_TO_NOTE_COMMAND,
      ({ noteId }) => {
        if (!noteId) {
          return false;
        }
        const targetItem = $findNoteById(noteId);
        if (!targetItem) {
          return false;
        }
        onZoomNoteIdChange?.(noteId);
        $selectItemEdge(targetItem, 'start');
        editor.focus();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onZoomNoteIdChange]);

  const handleBulletPointerDown = useCallback(
    (event: PointerEvent | MouseEvent, listItem: HTMLElement | null) => {
      if (!listItem) {
        return;
      }

      if (!isBulletHit(listItem, event as PointerEvent)) {
        return;
      }

      const noteId = editor.read(() => $resolveNoteIdFromDOMNode(listItem));

      if (!noteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId });
    },
    [editor]
  );

  const handleBulletPointerMove = useCallback(
    (event: PointerEvent | MouseEvent, listItem: HTMLElement | null) => {
      const clearBulletHover = () => {
        if (lastBulletHoverRef.current) {
          delete lastBulletHoverRef.current.dataset.zoomBulletHover;
          lastBulletHoverRef.current = null;
        }
      };

      const clearCheckboxHover = () => {
        if (lastCheckboxHoverRef.current) {
          delete lastCheckboxHoverRef.current.dataset.zoomCheckboxHover;
          lastCheckboxHoverRef.current = null;
        }
      };

      if (!listItem) {
        clearBulletHover();
        clearCheckboxHover();
        return;
      }

      const canZoom = editor.read(() => {
        return Boolean($resolveContentNoteFromDOMNode(listItem));
      });

      if (!canZoom) {
        clearBulletHover();
        clearCheckboxHover();
        return;
      }

      if (isBulletHit(listItem, event as PointerEvent)) {
        if (lastBulletHoverRef.current !== listItem) {
          clearBulletHover();
          listItem.dataset.zoomBulletHover = 'true';
          lastBulletHoverRef.current = listItem;
        }
        clearCheckboxHover();
        return;
      }

      if (isCheckboxHit(listItem, event as PointerEvent)) {
        if (lastCheckboxHoverRef.current !== listItem) {
          clearCheckboxHover();
          listItem.dataset.zoomCheckboxHover = 'true';
          lastCheckboxHoverRef.current = listItem;
        }
        clearBulletHover();
        return;
      }

      clearBulletHover();
      clearCheckboxHover();
    },
    [editor]
  );

  const handlePointerLeave = useCallback(() => {
    if (lastBulletHoverRef.current) {
      delete lastBulletHoverRef.current.dataset.zoomBulletHover;
      lastBulletHoverRef.current = null;
    }
    if (lastCheckboxHoverRef.current) {
      delete lastCheckboxHoverRef.current.dataset.zoomCheckboxHover;
      lastCheckboxHoverRef.current = null;
    }
  }, []);

  useEffect(() => {
    let currentRoot = editor.getRootElement();
    rootRef.current = currentRoot;

    const resolveListItemFromEvent = (event: PointerEvent | MouseEvent) => {
      const root = rootRef.current;
      if (!root) {
        return null;
      }

      const resolveFromElement = (element: Element | null): HTMLElement | null =>
        element ? element.closest<HTMLElement>('li.list-item') : null;

      let listItem: HTMLElement | null = event.target instanceof Element
        ? resolveFromElement(event.target)
        : null;

      if (!listItem && typeof document.elementsFromPoint === 'function') {
        const stack = document.elementsFromPoint(event.clientX, event.clientY);
        for (const element of stack) {
          listItem = resolveFromElement(element);
          if (listItem) {
            break;
          }
        }
      }

      if (!listItem) {
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        listItem = resolveFromElement(hit);
      }

      if (!listItem || !root.contains(listItem)) {
        return null;
      }

      return listItem;
    };

    const handleDocumentPointerMove = (event: PointerEvent | MouseEvent) => {
      const listItem = resolveListItemFromEvent(event);
      handleBulletPointerMove(event, listItem);
    };

    const handleDocumentPointerDown = (event: PointerEvent | MouseEvent) => {
      const listItem = resolveListItemFromEvent(event);
      if (!listItem) {
        return;
      }
      handleBulletPointerDown(event, listItem);
    };

    document.addEventListener('pointermove', handleDocumentPointerMove);
    document.addEventListener('pointerdown', handleDocumentPointerDown);

    const unregisterRootListener = editor.registerRootListener((rootElement, _previousRoot) => {
      currentRoot = rootElement ?? null;
      rootRef.current = currentRoot;
    });

    return () => {
      unregisterRootListener();
      document.removeEventListener('pointermove', handleDocumentPointerMove);
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      handlePointerLeave();
    };
  }, [editor, handleBulletPointerDown, handleBulletPointerMove, handlePointerLeave]);

  useEffect(() => {
    const handleUpdate = ({
      editorState,
      dirtyElements,
      dirtyLeaves,
      tags,
    }: UpdateListenerPayload) => {
      const mergeHint = consumeZoomMergeHint(editor);
      const noteId = zoomNoteIdRef.current;
      const isZoomInit = tags.has(ZOOM_INIT_TAG);
      const shouldConsiderAutoZoom =
        Boolean(noteId) &&
        autoZoomReadyRef.current &&
        !tags.has(COLLABORATION_TAG) &&
        !tags.has(TEST_BRIDGE_LOAD_TAG) &&
        !tags.has(NOTE_ID_NORMALIZE_TAG) &&
        !tags.has(ROOT_SCHEMA_NORMALIZE_TAG) &&
        !isZoomInit;
      const prevParentKey = zoomParentKeyRef.current;
      const parentWasTracked = zoomParentTrackedRef.current;

      const resolved = editorState.read(() => {
        const selection = $getSelection();
        const selectionItem = $isRangeSelection(selection)
          ? $resolveContentNoteFromNode(selection.anchor.getNode())
          : null;
        const selectionKey =
          $isRangeSelection(selection) && selection.isCollapsed()
            ? selectionItem?.getKey() ?? null
            : null;
        if (!noteId) {
          return {
            root: null,
            path: [] as NotePathItem[],
            nextZoomNoteId: undefined,
            parentKey: null,
            boundaryKey: null,
            scrollTargetKey: null as string | null,
            selectionInZoomRoot: false,
          };
        }

        const root = $findNoteById(noteId);
        if (!root) {
          return {
            root: null,
            path: [] as NotePathItem[],
            nextZoomNoteId: undefined,
            parentKey: null,
            boundaryKey: null,
            scrollTargetKey: null as string | null,
            selectionInZoomRoot: false,
          };
        }

        const path = $getNoteAncestorPath(root);
        const parent = getParentContentItem(root);
        const parentKey = parent?.getKey() ?? null;
        const selectionInZoomRoot = selectionItem ? isContentDescendantOf(selectionItem, root) : false;
        let nextZoomNoteId: string | null | undefined;
        let scrollTargetKey: string | null = null;

        if (shouldConsiderAutoZoom) {
          let mergeHintApplied = false;
          if (mergeHint) {
            let shouldApply = true;
            if (mergeHint.noteId) {
              const mergeItem = $findNoteById(mergeHint.noteId);
              if (mergeItem && isContentDescendantOf(mergeItem, root)) {
                shouldApply = false;
              }
            }
            if (shouldApply) {
              nextZoomNoteId = mergeHint.noteId;
              scrollTargetKey = selectionKey;
              mergeHintApplied = true;
            }
          }

          if (!mergeHintApplied) {
            const parentChanged = parentWasTracked && prevParentKey !== parentKey;
            if (parentChanged) {
              nextZoomNoteId = parent ? $requireContentItemNoteId(parent) : null;
              scrollTargetKey = selectionKey;
            } else {
              const dirtyItems = $collectDirtyContentItems(dirtyElements, dirtyLeaves);
              const outsideItems = dirtyItems.filter(
                (item) => !isContentDescendantOf(item, root) && !isContentDescendantOf(root, item)
              );

              if (outsideItems.length > 0) {
                scrollTargetKey = outsideItems[0]?.getKey() ?? null;
                if (selectionKey) {
                  const selectionDirty = dirtyItems.some((item) => item.getKey() === selectionKey);
                  if (selectionDirty) {
                    scrollTargetKey = selectionKey;
                  }
                }
                const ancestor = resolveZoomAncestor(root, outsideItems);
                nextZoomNoteId = ancestor ? $requireContentItemNoteId(ancestor) : null;
              }
            }
          }
        }

        return {
          root,
          path,
          nextZoomNoteId,
          parentKey,
          boundaryKey: root.getKey(),
          scrollTargetKey,
          selectionInZoomRoot,
        };
      });

      if (resolved.root) {
        zoomParentTrackedRef.current = true;
        zoomParentKeyRef.current = resolved.parentKey ?? null;
      } else {
        zoomParentTrackedRef.current = false;
        zoomParentKeyRef.current = null;
      }

      if (zoomNoteIdRef.current && !resolved.root && collab.hydrated && !isZoomInit) {
        pendingZoomSelectionRef.current = null;
        pendingZoomSelectionTaskRef.current = false;
        pendingZoomSelectionNonceRef.current += 1;
        skipZoomSelectionRef.current = true;
        onZoomNoteIdChange?.(null);
      }

      if (
        resolved.nextZoomNoteId !== undefined &&
        resolved.nextZoomNoteId !== zoomNoteIdRef.current
      ) {
        pendingZoomSelectionRef.current = null;
        pendingZoomSelectionTaskRef.current = false;
        pendingZoomSelectionNonceRef.current += 1;
        suppressPathUpdatesRef.current = true;
        if (resolved.scrollTargetKey) {
          setZoomScrollTarget(editor, resolved.scrollTargetKey);
        }
        skipZoomSelectionRef.current = true;
        onZoomNoteIdChange?.(resolved.nextZoomNoteId ?? null);
        if (onZoomPathChange) {
          let nextPath: NotePathItem[] = [];
          const nextNoteId = resolved.nextZoomNoteId ?? null;
          editor.getEditorState().read(() => {
            if (!nextNoteId) {
              return;
            }
            const nextRoot = $findNoteById(nextNoteId);
            if (nextRoot) {
              nextPath = $getNoteAncestorPath(nextRoot);
            }
          });
          if (!isPathEqual(nextPath, lastPathRef.current)) {
            lastPathRef.current = nextPath;
            onZoomPathChange(nextPath);
          }
        }
        return;
      }

      setSelectionBoundary(editor, resolved.boundaryKey ?? null);

      if (!suppressPathUpdatesRef.current && !isPathEqual(resolved.path, lastPathRef.current)) {
        lastPathRef.current = resolved.path;
        onZoomPathChange?.(resolved.path);
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

              const targetItem = $findNoteById(noteId);
              if (!targetItem) {
                pendingZoomSelectionRef.current = noteId;
                return;
              }

              const selection = $getSelection();
              const selectionItem = $isRangeSelection(selection)
                ? $resolveContentNoteFromNode(selection.anchor.getNode())
                : null;
              if (selectionItem && isContentDescendantOf(selectionItem, targetItem)) {
                pendingZoomSelectionRef.current = null;
                return;
              }

              pendingZoomSelectionRef.current = null;
              $selectItemEdge(targetItem, 'start');
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
  }, [collab.hydrated, editor, onZoomNoteIdChange, onZoomPathChange]);

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
      const targetItem = $findNoteById(noteId);
      if (!targetItem) {
        pendingZoomSelectionRef.current = noteId;
        return;
      }
      pendingZoomSelectionRef.current = null;
      $selectItemEdge(targetItem, 'start');
    }, { tag: ZOOM_CARET_TAG });
  }, [editor, zoomNoteId]);

  return null;
}
