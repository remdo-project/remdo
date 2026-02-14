import type { ListNode } from '@lexical/list';
import { $isListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';
import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';

import { $isNoteFolded, $setNoteFolded } from '#lib/editor/fold-state';
import { SET_NOTE_FOLD_COMMAND } from '@/editor/commands';
import { $resolveContentNoteFromNode } from '@/editor/outline/note-context';
import { $resolveContentItemFromNode } from '@/editor/outline/schema';
import { getContentSiblings, isChildrenWrapper } from '@/editor/outline/list-structure';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import type { OutlineSelection } from '@/editor/outline/selection/model';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { getNestedList, isContentDescendantOf, noteHasChildren } from '@/editor/outline/selection/tree';

const FOLD_ATTR = 'folded';

const collectFoldedKeys = (list: ListNode, keys: Set<string>): void => {
  const items = getContentSiblings(list);
  for (const item of items) {
    if ($isNoteFolded(item) && noteHasChildren(item)) {
      keys.add(item.getKey());
    }
    const nested = getNestedList(item);
    if (nested) {
      collectFoldedKeys(nested, keys);
    }
  }
};

const $shouldCollapseSelection = (
  selection: ReturnType<typeof $getSelection>,
  outlineSelection: OutlineSelection | null,
  foldedItem: ListItemNode
): boolean => {
  if (outlineSelection?.kind === 'structural') {
    const keys = outlineSelection.selectedKeys.length > 0 ? outlineSelection.selectedKeys : outlineSelection.headKeys;
    for (const key of keys) {
      const node = $getNodeByKey<ListItemNode>(key);
      const contentItem = node ? $resolveContentItemFromNode(node) : null;
      if (!contentItem) {
        continue;
      }
      if (contentItem.getKey() === foldedItem.getKey()) {
        continue;
      }
      if (isContentDescendantOf(contentItem, foldedItem)) {
        return true;
      }
    }
    return false;
  }

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const anchorItem = $resolveContentNoteFromNode(selection.anchor.getNode());
  const focusItem = $resolveContentNoteFromNode(selection.focus.getNode());
  if (!anchorItem && !focusItem) {
    return false;
  }
  const items = [anchorItem, focusItem].filter((item): item is ListItemNode => item !== null);
  return items.some((item) => {
    if (item.getKey() === foldedItem.getKey()) {
      return false;
    }
    return isContentDescendantOf(item, foldedItem);
  });
};

export function FoldingPlugin() {
  const [editor] = useLexicalComposerContext();
  const foldedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    installOutlineSelectionHelpers(editor);

    const applyFoldedAttributes = (nextFoldedKeys: Set<string>) => {
      const previous = foldedKeysRef.current;

      for (const key of previous) {
        if (nextFoldedKeys.has(key)) {
          continue;
        }
        const element = editor.getElementByKey(key);
        if (element instanceof HTMLElement) {
          delete element.dataset[FOLD_ATTR];
        }
      }

      for (const key of nextFoldedKeys) {
        if (previous.has(key)) {
          continue;
        }
        const element = editor.getElementByKey(key);
        if (element instanceof HTMLElement) {
          element.dataset[FOLD_ATTR] = 'true';
        }
      }

      foldedKeysRef.current = nextFoldedKeys;
    };

    const readFoldedKeys = (state = editor.getEditorState()): Set<string> =>
      state.read(() => {
        const keys = new Set<string>();
        const root = $getRoot();
        const firstChild = root.getFirstChild();
        if ($isListNode(firstChild)) {
          collectFoldedKeys(firstChild, keys);
        }
        return keys;
      });

    const refreshFoldedAttributes = () => {
      if (!editor.getRootElement()) {
        foldedKeysRef.current = new Set();
        return;
      }
      foldedKeysRef.current = new Set();
      applyFoldedAttributes(readFoldedKeys());
    };

    refreshFoldedAttributes();

    const unregisterTransform = editor.registerNodeTransform(ListItemNode, (node) => {
      if (isChildrenWrapper(node)) {
        return;
      }
      const isFolded = $isNoteFolded(node);
      if (isFolded && !noteHasChildren(node)) {
        $setNoteFolded(node, false);
        return;
      }
      if (!isFolded) {
        return;
      }
      const selection = $getSelection();
      const outlineSelection = editor.selection.get();
      if ($shouldCollapseSelection(selection, outlineSelection, node)) {
        $selectItemEdge(node, 'end');
      }
    });

    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      const { nextFoldedKeys } = editorState.read(() => {
        const nextFoldedKeys = new Set<string>();
        const root = $getRoot();
        const firstChild = root.getFirstChild();
        if ($isListNode(firstChild)) {
          collectFoldedKeys(firstChild, nextFoldedKeys);
        }
        return { nextFoldedKeys };
      });

      applyFoldedAttributes(nextFoldedKeys);
    });

    const unregisterRootListener = editor.registerRootListener(() => {
      refreshFoldedAttributes();
    });

    const unregisterSetCommand = editor.registerCommand(
      SET_NOTE_FOLD_COMMAND,
      ({ state, noteItemKey }) => {
        const node = $getNodeByKey<ListItemNode>(noteItemKey);
        const contentItem = node ? $resolveContentItemFromNode(node) : null;
        if (!contentItem) {
          return false;
        }
        if (!noteHasChildren(contentItem)) {
          return false;
        }
        if (state === 'toggle') {
          $setNoteFolded(contentItem, !$isNoteFolded(contentItem));
          return true;
        }
        $setNoteFolded(contentItem, state === 'folded');
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterRootListener();
      unregisterSetCommand();
      unregisterUpdate();
      unregisterTransform();
    };
  }, [editor]);

  return null;
}
