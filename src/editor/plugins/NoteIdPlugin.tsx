import type { ListNode } from '@lexical/list';
import { ListItemNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getState, $setState } from 'lexical';
import { useEffect, useRef } from 'react';
import { createNoteId } from '#lib/editor/note-ids';
import { noteIdState } from '#lib/editor/note-id-state';
import { reportInvariant } from '@/editor/invariant';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from './collaboration';

function $ensureNoteId(
  item: ListItemNode,
  docId: string,
  usedIds: Set<string>,
  seenIds: Map<string, string>
) {
  if (isChildrenWrapper(item)) {
    return;
  }

  const key = item.getKey();
  const seen = seenIds.get(key);
  const noteId = $getState(item, noteIdState);

  if (seen) {
    const reasons: string[] = [];
    if (noteId !== seen) {
      reasons.push('noteId changed after initialization');
    }
    if (typeof noteId !== 'string' || noteId.length === 0) {
      reasons.push('noteId missing or empty');
    }
    if (noteId === docId) {
      reasons.push('noteId matches documentId');
    }
    if (typeof noteId === 'string' && noteId.length > 0 && noteId !== seen && usedIds.has(noteId)) {
      reasons.push('noteId duplicates existing/retired id');
    }

    if (reasons.length > 0) {
      reportInvariant({
        message: 'Invalid noteId detected for existing note',
        context: {
          docId,
          noteKey: key,
          previousNoteId: seen,
          currentNoteId: noteId,
          reasons,
        },
      });
    }
  }

  if (seen && noteId === seen) {
    return;
  }

  let normalized: string;
  if (typeof noteId === 'string' && noteId.length > 0 && noteId !== docId && !usedIds.has(noteId)) {
    normalized = noteId;
  } else {
    normalized = createNoteId(docId, usedIds);
    $setState(item, noteIdState, normalized);
  }

  usedIds.add(normalized);
  seenIds.set(key, normalized);
}

function $normalizeListNoteIds(
  list: ListNode,
  docId: string,
  usedIds: Set<string>,
  seenIds: Map<string, string>
) {
  for (const child of list.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    if (isChildrenWrapper(child)) {
      const nested = child.getFirstChild();
      if ($isListNode(nested)) {
        $normalizeListNoteIds(nested, docId, usedIds, seenIds);
      }
      continue;
    }
    $ensureNoteId(child, docId, usedIds, seenIds);
  }
}

function $normalizeNoteIds(
  root: ReturnType<typeof $getRoot>,
  docId: string,
  usedIds: Set<string>,
  seenIds: Map<string, string>
) {
  const rootChildren = root.getChildren();
  const list = rootChildren.find($isListNode);
  if (!$isListNode(list)) {
    return;
  }

  $normalizeListNoteIds(list, docId, usedIds, seenIds);
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const usedIdsRef = useRef<Set<string> | null>(null);
  const seenIdsRef = useRef<Map<string, string> | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const usedIds = new Set<string>();
    if (docId.length > 0) {
      usedIds.add(docId);
    }
    const seenIds = new Map<string, string>();
    usedIdsRef.current = usedIds;
    seenIdsRef.current = seenIds;
    readyRef.current = false;

    editor.update(() => {
      $normalizeNoteIds($getRoot(), docId, usedIds, seenIds);
    });

    readyRef.current = true;

    const unregister = editor.registerNodeTransform(ListItemNode, (node) => {
      const used = usedIdsRef.current;
      const seen = seenIdsRef.current;
      if (!readyRef.current || !used || !seen) {
        return;
      }
      $ensureNoteId(node, docId, used, seen);
    });

    return () => {
      unregister();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}

export default NoteIdPlugin;
