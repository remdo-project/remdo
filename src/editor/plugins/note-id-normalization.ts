import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { RootNode } from 'lexical';
import { $setState } from 'lexical';

import { createNoteIdAvoiding } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { reportInvariant } from '@/editor/invariant';

function formatPath(path: number[]): string {
  return path.length === 0 ? 'root' : path.join('.');
}

function formatTextSnippet(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const snippet = trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
  return JSON.stringify(snippet);
}

function $normalizeNoteIdOnLoad(item: ListItemNode, usedIds: Set<string>, path: number[]) {
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
    const reason = noteId ? `duplicate-note-id noteId=${noteId}` : 'missing-note-id';
    const pathLabel = `path=${formatPath(path)}`;
    const textLabel = formatTextSnippet(item.getTextContent());
    const textSuffix = textLabel ? ` text=${textLabel}` : '';
    reportInvariant({ message: `note-id-normalized ${reason} ${pathLabel}${textSuffix}` });
  }

  usedIds.add(normalized);
}

function $normalizeListNoteIds(list: ListNode, usedIds: Set<string>, prefix: number[] = []) {
  const stack: Array<{
    children: ReturnType<ListNode['getChildren']>;
    childIndex: number;
    noteIndex: number;
    prefix: number[];
  }> = [
    {
      children: list.getChildren(),
      childIndex: 0,
      noteIndex: 0,
      prefix,
    },
  ];

  while (stack.length > 0) {
    const frame = stack.at(-1)!;
    if (frame.childIndex >= frame.children.length) {
      stack.pop();
      continue;
    }

    const child = frame.children[frame.childIndex];
    frame.childIndex += 1;

    if (!$isListItemNode(child)) {
      continue;
    }

    if (isChildrenWrapper(child)) {
      const nested = child.getFirstChild();
      if ($isListNode(nested)) {
        const wrapperIndex = Math.max(frame.noteIndex - 1, 0);
        stack.push({
          children: nested.getChildren(),
          childIndex: 0,
          noteIndex: 0,
          prefix: [...frame.prefix, wrapperIndex],
        });
      }
      continue;
    }

    const path = [...frame.prefix, frame.noteIndex];
    frame.noteIndex += 1;
    $normalizeNoteIdOnLoad(child, usedIds, path);
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
