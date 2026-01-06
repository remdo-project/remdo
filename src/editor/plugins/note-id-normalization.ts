import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RootNode } from 'lexical';
import { $setState } from 'lexical';

import { createNoteIdAvoiding } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from '@/editor/outline/list-structure';

function $normalizeNoteIdOnLoad(item: ListItemNode, usedIds: Set<string>) {
  if (isChildrenWrapper(item)) {
    return;
  }
  const noteId = $getNoteId(item);

  let normalized: string;
  if (noteId && !usedIds.has(noteId)) {
    normalized = noteId;
  } else {
    normalized = createNoteIdAvoiding(usedIds);
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

function $normalizeNoteIds(root: RootNode, usedIds: Set<string>) {
  const rootChildren = root.getChildren();
  const list = rootChildren.find($isListNode);
  if (!$isListNode(list)) {
    return;
  }

  $normalizeListNoteIds(list, usedIds);
}

export function $normalizeNoteIdsOnLoad(root: RootNode, docId: string): void {
  const used = new Set<string>();
  if (docId.length > 0) {
    used.add(docId);
  }
  $normalizeNoteIds(root, used);
}
