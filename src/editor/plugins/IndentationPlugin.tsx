import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $indentNote, $outdentNote } from '../lexical-helpers';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { getPreviousContentSibling } from '@/editor/outline/list-structure';
import { $resolveZoomBoundaryRoot, isWithinZoomBoundary } from '@/editor/outline/selection/boundary';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { getParentContentItem, isContentDescendantOf } from '@/editor/outline/selection/tree';

const hasPreviousContentSibling = (noteItem: ListItemNode, boundaryRoot: ListItemNode | null): boolean => {
  const previous = getPreviousContentSibling(noteItem);
  if (!previous) {
    return false;
  }
  return isWithinZoomBoundary(previous, boundaryRoot);
};

const canIndentNote = (noteItem: ListItemNode, boundaryRoot: ListItemNode | null): boolean => {
  if (!isWithinZoomBoundary(noteItem, boundaryRoot)) {
    return false;
  }
  return hasPreviousContentSibling(noteItem, boundaryRoot);
};

const canOutdentNote = (noteItem: ListItemNode, boundaryRoot: ListItemNode | null): boolean => {
  if (!isWithinZoomBoundary(noteItem, boundaryRoot)) {
    return false;
  }

  const parent = getParentContentItem(noteItem);
  if (!parent) {
    return false;
  }
  if (!boundaryRoot) {
    return true;
  }
  if (!isContentDescendantOf(parent, boundaryRoot)) {
    return false;
  }
  return parent.getKey() !== boundaryRoot.getKey();
};

export function IndentationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        // Only handle range selections (both collapsed and non-collapsed)
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const heads = getContiguousSelectionHeads(selection);
        let rootItems = heads;

        if (rootItems.length === 0 && selection.isCollapsed()) {
          const contentItem = resolveContentItemFromNode(selection.anchor.getNode());
          if (contentItem) {
            rootItems = [contentItem];
          }
        }

        if (rootItems.length === 0) {
          return false;
        }

        const boundaryRoot = $resolveZoomBoundaryRoot(editor);
        event.preventDefault();

        if (event.shiftKey) {
          const allCanOutdent = rootItems.every((item) => canOutdentNote(item, boundaryRoot));
          if (!allCanOutdent) {
            return true;
          }

          for (const listItem of rootItems.toReversed()) {
            $outdentNote(listItem);
          }
        } else {
          // Check if all notes can be indented before attempting to indent any
          const allCanIndent = rootItems.every((item) => canIndentNote(item, boundaryRoot));
          if (!allCanIndent) {
            // If any note can't be indented, make the entire operation a no-op
            return true;
          }

          for (const listItem of rootItems) {
            $indentNote(listItem);
          }
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
