import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, KEY_TAB_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { $indentNote, $outdentNote } from '../lexical-helpers';
import { resolveContentItemFromNode } from '@/editor/outline/schema';
import { getPreviousContentSibling } from '@/editor/outline/list-structure';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { getParentContentItem } from '@/editor/outline/selection/tree';

const hasPreviousContentSibling = (noteItem: ListItemNode): boolean => getPreviousContentSibling(noteItem) !== null;

const canIndentNote = (noteItem: ListItemNode): boolean => hasPreviousContentSibling(noteItem);

const canOutdentNote = (noteItem: ListItemNode): boolean => getParentContentItem(noteItem) !== null;

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

        event.preventDefault();

        if (event.shiftKey) {
          const allCanOutdent = rootItems.every(canOutdentNote);
          if (!allCanOutdent) {
            return true;
          }

          for (const listItem of rootItems.toReversed()) {
            $outdentNote(listItem);
          }
        } else {
          // Check if all notes can be indented before attempting to indent any
          const allCanIndent = rootItems.every(canIndentNote);
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
