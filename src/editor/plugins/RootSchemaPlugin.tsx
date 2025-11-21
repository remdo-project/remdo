import type { ListNode } from '@lexical/list';
import type { LexicalEditor } from 'lexical';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $getRoot, RootNode } from 'lexical';
import { useEffect } from 'react';
import { useCollaborationStatus } from './collaboration';

export function RootSchemaPlugin() {
  const [editor] = useLexicalComposerContext();
  const { awaitReady } = useCollaborationStatus();

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;

    void awaitReady()
      .then(() => {
        if (cancelled) return;
        unregister = editor.registerNodeTransform(RootNode, $ensureSingleListRoot);
        normalizeRootOnce(editor);
      })
      .catch(() => {
        // readiness failed; allow effect to complete without registration
      });

    return () => {
      cancelled = true;
      unregister?.();
    };
  }, [awaitReady, editor]);

  return null;
}

function $ensureSingleListRoot(root: RootNode) {
  if (!$needsListNormalization(root)) {
    return;
  }

  // Ensure exactly one root list, preferring the existing list type when present.
  const rootChildren = root.getChildren();
  const firstChild = rootChildren[0];
  const existingList = rootChildren.find($isListNode);
  const canonicalListType = existingList?.getListType() ?? 'bullet';

  let canonicalList: ListNode;
  if ($isListNode(firstChild)) {
    canonicalList = firstChild;
  } else {
    canonicalList = $createListNode(canonicalListType);
    if (firstChild) {
      firstChild.insertBefore(canonicalList);
    } else {
      root.append(canonicalList);
    }
  }

  // Move/merge all other root children into the canonical list.
  const mergeType = canonicalList.getListType();
  for (const child of rootChildren) {
    if (child === canonicalList) continue;

    // Merge lists of the same type by lifting their items.
    if ($isListNode(child) && child.getListType() === mergeType) {
      canonicalList.append(...child.getChildren()); // moves nodes, keeps keys
      child.remove();
      continue;
    }

    // Wrap any other node into a list item to preserve content.
    const li = $createListItemNode();
    child.remove();
    li.append(child);
    canonicalList.append(li);
  }

  // Ensure at least one list item with a paragraph exists.
  if (canonicalList.getChildrenSize() === 0) {
    const li = $createListItemNode();
    li.append($createParagraphNode());
    canonicalList.append(li);
  }
}

function normalizeRootOnce(editor: LexicalEditor) {
  // Run a one-time normalization outside the transform cycle for fresh editors.
  editor.update(() => {
    $ensureSingleListRoot($getRoot());
  });
}

/**
 * Returns true when the root diverges from our canonical single-list shape.
 * Assumes Lexical's ListPlugin already keeps list children as ListItemNodes.
 */
function $needsListNormalization(root: RootNode): boolean {
  const first = root.getFirstChild();
  if (!$isListNode(first)) {
    return true;
  }

  if (first.getNextSibling() !== null) {
    return true;
  }

  if (first.getChildrenSize() === 0) {
    return true;
  }

  for (const child of first.getChildren()) {
    if (!$isListItemNode(child)) {
      return true;
    }
  }

  return false;
}
