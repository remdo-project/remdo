import type { ListNode } from '@lexical/list';
import { ListItemNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getState, $setState } from 'lexical';
import { useEffect, useRef } from 'react';
import { createNoteId } from '#lib/editor/note-ids';
import { noteIdState } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from './collaboration';

function $ensureNoteId(item: ListItemNode, docId: string) {
  if (isChildrenWrapper(item)) {
    return;
  }
  const noteId = $getState(item, noteIdState);

  let normalized: string;
  if (typeof noteId === 'string' && noteId.length > 0 && noteId !== docId) {
    normalized = noteId;
  } else {
    const reserved = new Set<string>();
    if (docId.length > 0) {
      reserved.add(docId);
    }
    normalized = createNoteId(docId, reserved);
    $setState(item, noteIdState, normalized);
  }
}

function $normalizeNoteIdOnLoad(
  item: ListItemNode,
  docId: string,
  usedIds: Set<string>
) {
  if (isChildrenWrapper(item)) {
    return;
  }
  const noteId = $getState(item, noteIdState);

  let normalized: string;
  if (typeof noteId === 'string' && noteId.length > 0 && noteId !== docId && !usedIds.has(noteId)) {
    normalized = noteId;
  } else {
    normalized = createNoteId(docId, usedIds);
    $setState(item, noteIdState, normalized);
  }

  usedIds.add(normalized);
}

function $normalizeListNoteIds(
  list: ListNode,
  docId: string,
  usedIds: Set<string>
) {
  for (const child of list.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    if (isChildrenWrapper(child)) {
      const nested = child.getFirstChild();
      if ($isListNode(nested)) {
        $normalizeListNoteIds(nested, docId, usedIds);
      }
      continue;
    }
    $normalizeNoteIdOnLoad(child, docId, usedIds);
  }
}

function $normalizeNoteIds(
  root: ReturnType<typeof $getRoot>,
  docId: string,
  usedIds: Set<string>
) {
  const rootChildren = root.getChildren();
  const list = rootChildren.find($isListNode);
  if (!$isListNode(list)) {
    return;
  }

  $normalizeListNoteIds(list, docId, usedIds);
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = true;

    if (hydrated) {
      editor.update(() => {
        const used = new Set<string>();
        if (docId.length > 0) {
          used.add(docId);
        }
        $normalizeNoteIds($getRoot(), docId, used);
      });
    }

    const unregister = editor.registerNodeTransform(ListItemNode, (node) => {
      if (!readyRef.current) {
        return;
      }
      $ensureNoteId(node, docId);
    });

    return () => {
      unregister();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
