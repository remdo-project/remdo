import type { ListNode } from '@lexical/list';
import { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';
import { $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, LexicalEditor } from 'lexical';

import { $isNoteFolded, $setNoteFolded } from '#lib/editor/fold-state';
import { FOLD_VIEW_TO_LEVEL_COMMAND, SET_NOTE_FOLD_COMMAND } from '@/editor/commands';
import { forEachContentItemInOutline, forEachContentItemWithAncestorsInOutline } from '@/editor/outline/list-traversal';
import { $resolveZoomBoundaryRoot } from '@/editor/outline/selection/boundary';
import { $resolveRootContentList, resolveContentItemFromNode } from '@/editor/outline/schema';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import type { OutlineSelection } from '@/editor/outline/selection/model';
import { $resolveStructuralItemsFromRange } from '@/editor/outline/selection/range';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { isContentDescendantOf, noteHasChildren } from '@/editor/outline/selection/tree';

const FOLD_ATTR = 'folded';

const collectFoldedKeys = (list: ListNode, keys: Set<string>): void => {
  forEachContentItemInOutline(list, (item) => {
    if ($isNoteFolded(item) && noteHasChildren(item)) {
      keys.add(item.getKey());
    }
  });
};

const $applyFoldViewToLevel = (editor: LexicalEditor, level: number): boolean => {
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    return false;
  }

  const rootList = $resolveRootContentList();
  if (!rootList) {
    return false;
  }

  const boundaryRoot = $resolveZoomBoundaryRoot(editor);
  const boundaryKey = boundaryRoot?.getKey() ?? null;
  let changed = false;

  forEachContentItemWithAncestorsInOutline(rootList, (item, ancestors) => {
    if (boundaryRoot) {
      if (item.getKey() === boundaryKey) {
        if ($isNoteFolded(item)) {
          $setNoteFolded(item, false);
          changed = true;
        }
        return;
      }

      const boundaryIndex = ancestors.findIndex((ancestor) => ancestor.getKey() === boundaryKey);
      if (boundaryIndex === -1) {
        return;
      }

      const relativeDepth = ancestors.length - boundaryIndex;
      const nextFolded = level > 0 && relativeDepth === level && noteHasChildren(item);
      if ($isNoteFolded(item) !== nextFolded) {
        $setNoteFolded(item, nextFolded);
        changed = true;
      }
      return;
    }

    const absoluteDepth = ancestors.length + 1;
    const nextFolded = level > 0 && absoluteDepth === level && noteHasChildren(item);
    if ($isNoteFolded(item) !== nextFolded) {
      $setNoteFolded(item, nextFolded);
      changed = true;
    }
  });

  return changed;
};

const $shouldCollapseSelection = (
  selection: ReturnType<typeof $getSelection>,
  outlineSelection: OutlineSelection | null,
  foldedItem: ListItemNode
): boolean => {
  if (outlineSelection?.kind === 'structural' && outlineSelection.range) {
    for (const contentItem of $resolveStructuralItemsFromRange(outlineSelection.range)) {
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

  const anchorItem = resolveContentItemFromNode(selection.anchor.getNode());
  const focusItem = resolveContentItemFromNode(selection.focus.getNode());
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
  const foldedKeysRef = useRef(new Set<string>());

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
        const rootList = $resolveRootContentList();
        if (!rootList) {
          return keys;
        }
        collectFoldedKeys(rootList, keys);
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
        const rootList = $resolveRootContentList();
        if (!rootList) {
          return { nextFoldedKeys };
        }
        collectFoldedKeys(rootList, nextFoldedKeys);
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
        const contentItem = node ? resolveContentItemFromNode(node) : null;
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

    const unregisterFoldViewCommand = editor.registerCommand(
      FOLD_VIEW_TO_LEVEL_COMMAND,
      ({ level }) => $applyFoldViewToLevel(editor, level),
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterFoldViewCommand();
      unregisterRootListener();
      unregisterSetCommand();
      unregisterUpdate();
      unregisterTransform();
    };
  }, [editor]);

  return null;
}
