import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $createNodeSelection, $getSelection, $isNodeSelection, $isRangeSelection, $setSelection } from 'lexical';
import type { LexicalNode } from 'lexical';

function isChildrenWrapper(node: ListItemNode): boolean {
  if (!$isListItemNode(node)) {
    return false;
  }
  const children = node.getChildren();
  return children.length === 1 && $isListNode(children[0]);
}

function isNoteContentItem(node: ListItemNode): boolean {
  return node
    .getChildren()
    .some((child) => typeof child.getType === 'function' && child.getType() !== 'list');
}

function findNearestContentItem(node: LexicalNode | null): ListItemNode | null {
  let current: LexicalNode | null = node;

  while (current) {
    if ($isListItemNode(current)) {
      if (isNoteContentItem(current)) {
        return current;
      }
    }
    current = current.getParent();
  }

  return null;
}

function getChildWrapper(note: ListItemNode): ListItemNode | null {
  const nextSibling = note.getNextSibling();
  return $isListItemNode(nextSibling) && isChildrenWrapper(nextSibling) ? nextSibling : null;
}

function getParentNote(note: ListItemNode): ListItemNode | null {
  const parentList = note.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }

  const wrapper = parentList.getParent();
  if (!$isListItemNode(wrapper)) {
    return null;
  }

  const possibleParent = wrapper.getPreviousSibling();
  if ($isListItemNode(possibleParent) && isNoteContentItem(possibleParent)) {
    return possibleParent;
  }

  return null;
}

function isDescendantOf(note: ListItemNode, maybeAncestor: ListItemNode): boolean {
  let current: ListItemNode | null = getParentNote(note);
  while (current) {
    if (current.is(maybeAncestor)) {
      return true;
    }
    current = getParentNote(current);
  }
  return false;
}

function collectContentNotesFromSelection(nodes: LexicalNode[]): ListItemNode[] {
  const byKey = new Map<string, ListItemNode>();
  for (const node of nodes) {
    const note = findNearestContentItem(node);
    if (!note) {
      continue;
    }
    byKey.set(note.getKey(), note);
  }
  return Array.from(byKey.values());
}

function collectSubtree(note: ListItemNode, acc: Map<string, ListItemNode>): void {
  const key = note.getKey();
  if (!acc.has(key)) {
    acc.set(key, note);
  }

  const wrapper = getChildWrapper(note);
  if (!wrapper) {
    return;
  }

  const wrapperKey = wrapper.getKey();
  if (!acc.has(wrapperKey)) {
    acc.set(wrapperKey, wrapper);
  }

  const childList = wrapper.getFirstChild();
  if (!$isListNode(childList)) {
    return;
  }

  for (const child of childList.getChildren()) {
    if (!$isListItemNode(child) || !isNoteContentItem(child)) {
      continue;
    }
    collectSubtree(child, acc);
  }
}

function toTopLevelNotes(notes: ListItemNode[]): ListItemNode[] {
  return notes.filter((candidate) =>
    !notes.some((other) => other !== candidate && isDescendantOf(candidate, other))
  );
}

function getNodePath(node: LexicalNode): number[] {
  const path: number[] = [];
  let current: LexicalNode | null = node;

  while (current) {
    const parent: LexicalNode | null = current.getParent();
    if (!parent) {
      break;
    }
    path.push(current.getIndexWithinParent());
    current = parent;
  }

  return path.reverse();
}

function sortByDocumentOrder<T extends LexicalNode>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => {
    const left = getNodePath(a);
    const right = getNodePath(b);
    const depth = Math.max(left.length, right.length);

    for (let i = 0; i < depth; i++) {
      const l = left[i] ?? -1;
      const r = right[i] ?? -1;
      if (l !== r) {
        return l - r;
      }
    }

    return 0;
  });
}

export function NoteSelectionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let applying = false;

    return editor.registerUpdateListener(({ editorState }) => {
      if (applying) {
        return;
      }

      let shouldPromote = false;
      let targetKeys: string[] = [];

      editorState.read(() => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          return;
        }

        if (!$isRangeSelection(selection)) {
          return;
        }

        const contentNotes = collectContentNotesFromSelection(selection.getNodes());
        if (contentNotes.length <= 1) {
          return;
        }

        const topLevelNotes = sortByDocumentOrder(toTopLevelNotes(contentNotes));
        if (topLevelNotes.length === 0) {
          return;
        }

        const collected = new Map<string, ListItemNode>();
        for (const note of topLevelNotes) {
          collectSubtree(note, collected);
        }

        if (collected.size > 0) {
          targetKeys = Array.from(collected.keys());
          shouldPromote = true;
        }
      });

      if (!shouldPromote) {
        return;
      }

      applying = true;
      try {
        editor.update(() => {
          const nodeSelection = $createNodeSelection();
          for (const key of targetKeys) {
            nodeSelection.add(key);
          }
          $setSelection(nodeSelection);
        });
      } finally {
        applying = false;
      }
    });
  }, [editor]);

  return null;
}
