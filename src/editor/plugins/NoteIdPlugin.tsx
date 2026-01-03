import type { ListNode } from '@lexical/list';
import { ListItemNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $setState } from 'lexical';
import { useEffect, useRef } from 'react';
import { createNoteId, createNoteIdWithUsedIds } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from './collaboration';

function $ensureNoteId(item: ListItemNode) {
  if (isChildrenWrapper(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createNoteId());
}

function $normalizeNoteIdOnLoad(item: ListItemNode, usedIds: Set<string>) {
  if (isChildrenWrapper(item)) {
    return;
  }
  const noteId = $getNoteId(item);

  let normalized: string;
  if (noteId && !usedIds.has(noteId)) {
    normalized = noteId;
  } else {
    normalized = createNoteIdWithUsedIds(usedIds);
    $setState(item, noteIdState, normalized);
  }

  usedIds.add(normalized);
}

function $normalizeListNoteIds(list: ListNode, usedIds: Set<string>) {
  for (const child of list.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    if (isChildrenWrapper(child)) {
      const nested = child.getFirstChild();
      if ($isListNode(nested)) {
        $normalizeListNoteIds(nested, usedIds);
      }
      continue;
    }
    $normalizeNoteIdOnLoad(child, usedIds);
  }
}

function $normalizeNoteIds(root: ReturnType<typeof $getRoot>, usedIds: Set<string>) {
  const rootChildren = root.getChildren();
  const list = rootChildren.find($isListNode);
  if (!$isListNode(list)) {
    return;
  }

  $normalizeListNoteIds(list, usedIds);
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
        $normalizeNoteIds($getRoot(), used);
      });
    }

    const unregister = editor.registerNodeTransform(ListItemNode, (node) => {
      if (!readyRef.current) {
        return;
      }
      $ensureNoteId(node);
    });

    return () => {
      unregister();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
