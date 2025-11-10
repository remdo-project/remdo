import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalNode, RangeSelection, TextNode } from 'lexical';
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  SELECT_ALL_COMMAND,
} from 'lexical';
import { useEffect, useRef } from 'react';

/**
 * Check if a ListItemNode is a children wrapper (contains only a ListNode)
 */
const isChildrenWrapper = (node: LexicalNode | null): node is ListItemNode => {
  return (
    $isListItemNode(node) &&
    node.getChildren().length === 1 &&
    $isListNode(node.getFirstChild())
  );
};

/**
 * Find the nearest ListItemNode ancestor (content node, not wrapper)
 */
const findNearestContentListItem = (node: LexicalNode | null): ListItemNode | null => {
  let current: LexicalNode | null = node;

  while (current) {
    if ($isListItemNode(current) && !isChildrenWrapper(current)) {
      return current;
    }
    current = current.getParent();
  }

  return null;
};

/**
 * Get all content ListItemNodes in a selection
 */
const getContentListItemsInSelection = (selection: RangeSelection): ListItemNode[] => {
  const nodes = selection.getNodes();
  const listItems: ListItemNode[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const listItem = findNearestContentListItem(node);
    if (!listItem) {
      continue;
    }

    const key = listItem.getKey();
    if (seen.has(key)) {
      continue;
    }

    listItems.push(listItem);
    seen.add(key);
  }

  return listItems;
};

/**
 * Get the first text node in a ListItemNode
 */
const getFirstTextNode = (item: ListItemNode): TextNode | null => {
  const children = item.getChildren();
  for (const child of children) {
    if ($isTextNode(child)) {
      return child;
    }
  }
  return null;
};

/**
 * Get the last text node in a ListItemNode
 */
const getLastTextNode = (item: ListItemNode): TextNode | null => {
  const children = item.getChildren();
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (!child) continue;

    if ($isTextNode(child)) {
      return child;
    }
  }
  return null;
};

/**
 * Check if selection spans multiple notes
 */
const selectionSpansMultipleNotes = (selection: RangeSelection): boolean => {
  const items = getContentListItemsInSelection(selection);
  return items.length > 1;
};

/**
 * Snap selection to whole notes by expanding to include entire note content
 */
const $snapSelectionToWholeNotes = (selection: RangeSelection): void => {
  const items = getContentListItemsInSelection(selection);

  if (items.length < 2) {
    // Selection is within a single note, no snapping needed
    return;
  }

  // Get first and last items
  const firstItem = items[0];
  const lastItem = items[items.length - 1];

  if (!firstItem || !lastItem) {
    return;
  }

  const firstTextNode = getFirstTextNode(firstItem);
  const lastTextNode = getLastTextNode(lastItem);

  if (!firstTextNode || !lastTextNode) {
    return;
  }

  // Expand selection to encompass whole notes
  const lastTextLength = lastTextNode.getTextContentSize?.() ?? lastTextNode.getTextContent().length;
  selection.setTextNodeRange(firstTextNode, 0, lastTextNode, lastTextLength);
};

/**
 * Get all descendants of a ListItemNode (including the wrapper)
 */
const getDescendants = (item: ListItemNode): ListItemNode[] => {
  const descendants: ListItemNode[] = [item];
  const wrapper = item.getNextSibling();

  if (isChildrenWrapper(wrapper)) {
    descendants.push(wrapper);
    const childList = wrapper.getFirstChild();
    if ($isListNode(childList)) {
      const children = childList.getChildren();
      for (const child of children) {
        if ($isListItemNode(child)) {
          descendants.push(...getDescendants(child));
        }
      }
    }
  }

  return descendants;
};

/**
 * Get all siblings at the same level
 */
const getSiblingsAtLevel = (item: ListItemNode): ListItemNode[] => {
  const parent = item.getParent();
  if (!$isListNode(parent)) {
    return [item];
  }

  const siblings: ListItemNode[] = [];
  const children = parent.getChildren();

  for (const child of children) {
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      siblings.push(child);
    }
  }

  return siblings;
};

/**
 * Get parent content ListItemNode
 */
const getParentContentItem = (item: ListItemNode): ListItemNode | null => {
  const parent = item.getParent();
  if (!$isListNode(parent)) {
    return null;
  }

  const wrapper = parent.getParent();
  if (!isChildrenWrapper(wrapper)) {
    return null;
  }

  const parentContent = wrapper.getPreviousSibling();
  if ($isListItemNode(parentContent) && !isChildrenWrapper(parentContent)) {
    return parentContent;
  }

  return null;
};

/**
 * Progressive selection stages for Cmd/Ctrl+A
 */
enum SelectionStage {
  INLINE_CONTENT = 1,
  WHOLE_NOTE = 2,
  NOTE_WITH_DESCENDANTS = 3,
  SIBLINGS = 4,
  PARENT_WITH_DESCENDANTS = 5,
}

/**
 * Expand selection to the next stage in progressive selection
 */
const $expandProgressiveSelection = (currentStage: SelectionStage): SelectionStage => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return SelectionStage.INLINE_CONTENT;
  }

  const items = getContentListItemsInSelection(selection);
  if (items.length === 0) {
    return SelectionStage.INLINE_CONTENT;
  }

  const anchorItem = findNearestContentListItem(selection.anchor.getNode());
  if (!anchorItem) {
    return SelectionStage.INLINE_CONTENT;
  }

  switch (currentStage) {
    case SelectionStage.INLINE_CONTENT: {
      // Stage 2: Select whole note (just the content, not descendants yet)
      const firstText = getFirstTextNode(anchorItem);
      const lastText = getLastTextNode(anchorItem);
      if (firstText && lastText) {
        const lastLength = lastText.getTextContentSize?.() ?? lastText.getTextContent().length;
        selection.setTextNodeRange(firstText, 0, lastText, lastLength);
      }
      return SelectionStage.WHOLE_NOTE;
    }

    case SelectionStage.WHOLE_NOTE: {
      // Stage 3: Extend to include all descendants
      const descendants = getDescendants(anchorItem);
      const lastDescendant = descendants[descendants.length - 1];
      const firstText = getFirstTextNode(anchorItem);
      const lastText = lastDescendant ? getLastTextNode(lastDescendant) : null;

      if (firstText && lastText) {
        const lastLength = lastText.getTextContentSize?.() ?? lastText.getTextContent().length;
        selection.setTextNodeRange(firstText, 0, lastText, lastLength);
      }
      return SelectionStage.NOTE_WITH_DESCENDANTS;
    }

    case SelectionStage.NOTE_WITH_DESCENDANTS: {
      // Stage 4: Select all siblings at same level (with their descendants)
      const siblings = getSiblingsAtLevel(anchorItem);
      if (siblings.length > 0) {
        const firstSibling = siblings[0];
        const lastSibling = siblings[siblings.length - 1];

        if (firstSibling && lastSibling) {
          const firstDescendants = getDescendants(firstSibling);
          const lastDescendants = getDescendants(lastSibling);
          const firstText = getFirstTextNode(firstDescendants[0]!);
          const lastDesc = lastDescendants[lastDescendants.length - 1];
          const lastText = lastDesc ? getLastTextNode(lastDesc) : null;

          if (firstText && lastText) {
            const lastLength = lastText.getTextContentSize?.() ?? lastText.getTextContent().length;
            selection.setTextNodeRange(firstText, 0, lastText, lastLength);
          }
        }
      }
      return SelectionStage.SIBLINGS;
    }

    case SelectionStage.SIBLINGS: {
      // Stage 5: Select parent and all its descendants
      const parentItem = getParentContentItem(anchorItem);
      if (parentItem) {
        const descendants = getDescendants(parentItem);
        const lastDescendant = descendants[descendants.length - 1];
        const firstText = getFirstTextNode(parentItem);
        const lastText = lastDescendant ? getLastTextNode(lastDescendant) : null;

        if (firstText && lastText) {
          const lastLength = lastText.getTextContentSize?.() ?? lastText.getTextContent().length;
          selection.setTextNodeRange(firstText, 0, lastText, lastLength);
        }
        return SelectionStage.NOTE_WITH_DESCENDANTS; // Reset to level 3 at parent level
      }

      // No parent, try to select all at root level
      const root = $getRoot();
      const list = root.getFirstChild();
      if ($isListNode(list)) {
        const children = list.getChildren();
        const contentItems = children.filter(
          (child): child is ListItemNode => $isListItemNode(child) && !isChildrenWrapper(child)
        );

        if (contentItems.length > 0) {
          const firstItem = contentItems[0];
          const lastItem = contentItems[contentItems.length - 1];

          if (firstItem && lastItem) {
            const firstDescendants = getDescendants(firstItem);
            const lastDescendants = getDescendants(lastItem);
            const firstText = getFirstTextNode(firstDescendants[0]!);
            const lastDesc = lastDescendants[lastDescendants.length - 1];
            const lastText = lastDesc ? getLastTextNode(lastDesc) : null;

            if (firstText && lastText) {
              const lastLength = lastText.getTextContentSize?.() ?? lastText.getTextContent().length;
              selection.setTextNodeRange(firstText, 0, lastText, lastLength);
            }
          }
        }
      }
      return SelectionStage.PARENT_WITH_DESCENDANTS;
    }

    case SelectionStage.PARENT_WITH_DESCENDANTS: {
      // Continue climbing up the tree
      const parentItem = getParentContentItem(anchorItem);
      if (parentItem) {
        // Recursively expand at parent level
        const parentAnchorItem = findNearestContentListItem(selection.anchor.getNode());
        if (parentAnchorItem) {
          return $expandProgressiveSelection(SelectionStage.SIBLINGS);
        }
      }
      return SelectionStage.PARENT_WITH_DESCENDANTS;
    }

    default:
      return SelectionStage.INLINE_CONTENT;
  }
};

/**
 * SelectionPlugin handles whole-note selection snapping and progressive selection
 */
export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const selectionStageRef = useRef<SelectionStage>(SelectionStage.INLINE_CONTENT);
  const lastSelectionRef = useRef<string>('');

  useEffect(() => {
    // Listen for selection changes to implement snapping
    const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return;
        }

        // Check if we need to snap to whole notes
        if (selectionSpansMultipleNotes(selection)) {
          // Schedule the snap to happen in the next update
          queueMicrotask(() => {
            editor.update(() => {
              const currentSelection = $getSelection();
              if ($isRangeSelection(currentSelection)) {
                $snapSelectionToWholeNotes(currentSelection);
              }
            });
          });
        }
      });
    });

    // Register Cmd/Ctrl+A for progressive selection
    const removeSelectAllCommand = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event: KeyboardEvent) => {
        event.preventDefault();

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        // Check if selection has changed since last SELECT_ALL
        const currentSelectionKey = selection.getTextContent();
        const lastSelection = lastSelectionRef.current;

        if (currentSelectionKey !== lastSelection) {
          // Selection changed, reset to stage 1
          selectionStageRef.current = SelectionStage.INLINE_CONTENT;
        }

        // Expand to next stage
        const nextStage = $expandProgressiveSelection(selectionStageRef.current);
        selectionStageRef.current = nextStage;

        // Store current selection
        const newSelection = $getSelection();
        if ($isRangeSelection(newSelection)) {
          lastSelectionRef.current = newSelection.getTextContent();
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    // Reset stage when any other action happens
    const removeArrowCommands = [
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => {
          selectionStageRef.current = SelectionStage.INLINE_CONTENT;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => {
          selectionStageRef.current = SelectionStage.INLINE_CONTENT;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        () => {
          selectionStageRef.current = SelectionStage.INLINE_CONTENT;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        () => {
          selectionStageRef.current = SelectionStage.INLINE_CONTENT;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
    ];

    return () => {
      removeUpdateListener();
      removeSelectAllCommand();
      removeArrowCommands.forEach((remove) => remove());
    };
  }, [editor]);

  return null;
}
