import type { ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
} from 'lexical';

import { $isNoteFolded, $setNoteFolded } from '#lib/editor/fold-state';
import { TOGGLE_NOTE_FOLD_COMMAND } from '@/editor/commands';
import { findNearestListItem, getContentListItem, getContentSiblings, isChildrenWrapper } from '@/editor/outline/list-structure';
import { $selectItemEdge } from '@/editor/outline/selection/caret';
import type { OutlineSelection } from '@/editor/outline/selection/model';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { getContentDepth, getNestedList, isContentDescendantOf } from '@/editor/outline/selection/tree';

const FOLD_ATTR = 'folded';
const FOLD_HOVER_ATTR = 'foldHover';

const noteHasChildren = (item: ListItemNode): boolean => {
  const nested = getNestedList(item);
  if (!nested) {
    return false;
  }
  return getContentSiblings(nested).length > 0;
};

const resolveTargetByY = (root: HTMLElement, clientY: number): HTMLElement | null => {
  const items = root.querySelectorAll<HTMLElement>('li.list-item:not(.list-nested-item)');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return item;
    }
  }
  return null;
};

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

const pickOuterMost = (items: ListItemNode[]): ListItemNode => {
  return items.reduce((best, current) =>
    getContentDepth(current) < getContentDepth(best) ? current : best
  );
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
      if (!$isListItemNode(node) || isChildrenWrapper(node)) {
        continue;
      }
      if (node.getKey() === foldedItem.getKey()) {
        continue;
      }
      if (isContentDescendantOf(node, foldedItem)) {
        return true;
      }
    }
    return false;
  }

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem && !focusItem) {
    return false;
  }
  const items = [anchorItem, focusItem].filter((item): item is ListItemNode => item !== null);
  return items.some((item) => {
    const contentItem = getContentListItem(item);
    if (contentItem.getKey() === foldedItem.getKey()) {
      return false;
    }
    return isContentDescendantOf(contentItem, foldedItem);
  });
};

const isFoldToggleHit = (element: HTMLElement, event: PointerEvent): boolean => {
  let afterStyle: CSSStyleDeclaration | null = null;
  try {
    afterStyle = globalThis.getComputedStyle(element, '::after');
  } catch {
    afterStyle = null;
  }

  if (!afterStyle) {
    return false;
  }

  const width = Number.parseFloat(afterStyle.width);
  const height = Number.parseFloat(afterStyle.height);
  const left = Number.parseFloat(afterStyle.left);
  const top = Number.parseFloat(afterStyle.top);
  if (![width, height, left, top].every(Number.isFinite)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const afterLeft = rect.left + left;
  const afterTop = rect.top + top;
  const afterRight = afterLeft + width;
  const afterBottom = afterTop + height;

  if (event.clientY < afterTop || event.clientY > afterBottom) {
    return false;
  }

  const iconSize = height;
  if (!Number.isFinite(iconSize) || iconSize <= 0 || width < iconSize) {
    return false;
  }

  const iconLeft = afterRight - iconSize;
  return event.clientX >= iconLeft && event.clientX <= afterRight;
};

export function FoldingPlugin() {
  const [editor] = useLexicalComposerContext();
  const foldedKeysRef = useRef<Set<string>>(new Set());
  const lastHoverRef = useRef<HTMLElement | null>(null);

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
      if ($isNoteFolded(node) && !noteHasChildren(node)) {
        $setNoteFolded(node, false);
      }
    });

    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      const previousFoldedKeys = foldedKeysRef.current;

      const { nextFoldedKeys, collapseKey } = editorState.read(() => {
        const nextFoldedKeys = new Set<string>();
        const root = $getRoot();
        const firstChild = root.getFirstChild();
        if ($isListNode(firstChild)) {
          collectFoldedKeys(firstChild, nextFoldedKeys);
        }

        const newlyFolded: ListItemNode[] = [];
        for (const key of nextFoldedKeys) {
          if (previousFoldedKeys.has(key)) {
            continue;
          }
          const node = $getNodeByKey<ListItemNode>(key);
          if ($isListItemNode(node) && !isChildrenWrapper(node)) {
            newlyFolded.push(node);
          }
        }

        let collapseKey: string | null = null;
        if (newlyFolded.length > 0) {
          const selection = $getSelection();
          const outlineSelection = editor.selection.get();
          const candidates = newlyFolded.filter((node) =>
            $shouldCollapseSelection(selection, outlineSelection, node)
          );
          if (candidates.length > 0) {
            collapseKey = pickOuterMost(candidates).getKey();
          }
        }

        return { nextFoldedKeys, collapseKey };
      });

      applyFoldedAttributes(nextFoldedKeys);

      if (collapseKey) {
        editor.update(() => {
          const node = $getNodeByKey<ListItemNode>(collapseKey);
          if ($isListItemNode(node) && !isChildrenWrapper(node)) {
            $selectItemEdge(node, 'end');
          }
        });
      }
    });

    const setHover = (next: HTMLElement | null) => {
      if (next === lastHoverRef.current) {
        return;
      }

      if (lastHoverRef.current) {
        delete lastHoverRef.current.dataset[FOLD_HOVER_ATTR];
      }

      if (next) {
        next.dataset[FOLD_HOVER_ATTR] = 'true';
      }

      lastHoverRef.current = next;
    };

    const clearHover = () => {
      setHover(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const root = editor.getRootElement();
      if (!root) {
        clearHover();
        return;
      }

      const surfaceRect = root.getBoundingClientRect();
      if (
        event.clientX < surfaceRect.left ||
        event.clientX > surfaceRect.right ||
        event.clientY < surfaceRect.top ||
        event.clientY > surfaceRect.bottom
      ) {
        clearHover();
        return;
      }

      if (lastHoverRef.current) {
        const rect = lastHoverRef.current.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          return;
        }
      }

      const eventTarget = event.target;
      const candidate =
        eventTarget instanceof HTMLElement
          ? eventTarget.closest<HTMLElement>('li.list-item:not(.list-nested-item)')
          : null;
      const nextHover = candidate ?? resolveTargetByY(root, event.clientY);

      setHover(nextHover);
    };

    const handlePointerLeave = () => {
      clearHover();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const rootElement = editor.getRootElement();
      const listItem =
        target.closest<HTMLElement>('li.list-item:not(.list-nested-item)') ??
        (rootElement ? resolveTargetByY(rootElement, event.clientY) : null);
      if (!listItem) {
        return;
      }
      if (!isFoldToggleHit(listItem, event)) {
        return;
      }

      const noteKey = editor.getEditorState().read(() => {
        const node = $getNearestNodeFromDOMNode(listItem);
        if (!node) {
          return null;
        }
        const listNode = findNearestListItem(node);
        if (!listNode) {
          return null;
        }
        const contentItem = getContentListItem(listNode);
        if (isChildrenWrapper(contentItem) || !noteHasChildren(contentItem)) {
          return null;
        }
        return contentItem.getKey();
      });

      if (!noteKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      editor.dispatchCommand(TOGGLE_NOTE_FOLD_COMMAND, { noteKey });
      editor.focus();
    };

    let currentRoot = editor.getRootElement();
    if (currentRoot) {
      currentRoot.addEventListener('pointermove', handlePointerMove);
      currentRoot.addEventListener('pointerleave', handlePointerLeave);
      currentRoot.addEventListener('pointerdown', handlePointerDown);
    }

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRoot) => {
      if (previousRoot) {
        previousRoot.removeEventListener('pointermove', handlePointerMove);
        previousRoot.removeEventListener('pointerleave', handlePointerLeave);
        previousRoot.removeEventListener('pointerdown', handlePointerDown);
      }
      currentRoot = rootElement;
      if (currentRoot) {
        currentRoot.addEventListener('pointermove', handlePointerMove);
        currentRoot.addEventListener('pointerleave', handlePointerLeave);
        currentRoot.addEventListener('pointerdown', handlePointerDown);
      }
      refreshFoldedAttributes();
    });

    const unregisterToggleCommand = editor.registerCommand(
      TOGGLE_NOTE_FOLD_COMMAND,
      ({ noteKey }) => {
        const node = $getNodeByKey<ListItemNode>(noteKey);
        if (!node) {
          return false;
        }
        const contentItem = getContentListItem(node);
        if (isChildrenWrapper(contentItem)) {
          return false;
        }
        if (!noteHasChildren(contentItem)) {
          return false;
        }
        $setNoteFolded(contentItem, !$isNoteFolded(contentItem));
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterRootListener();
      unregisterToggleCommand();
      unregisterUpdate();
      unregisterTransform();
      if (currentRoot) {
        currentRoot.removeEventListener('pointermove', handlePointerMove);
        currentRoot.removeEventListener('pointerleave', handlePointerLeave);
        currentRoot.removeEventListener('pointerdown', handlePointerDown);
      }
      clearHover();
    };
  }, [editor]);

  return null;
}
