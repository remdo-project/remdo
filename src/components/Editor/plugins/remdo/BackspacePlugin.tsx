// @ts-nocheck
// TODO(remdo): Revisit BackspacePlugin once Lexical provides stable command typings for custom editor behaviors.
import { useRemdoLexicalComposerContext } from "@/components/Editor/plugins/remdo/ComposerContext";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import { $isListItemNode } from "@lexical/list";
import { mergeRegister } from "@lexical/utils";
import {
  DELETE_CHARACTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
} from "lexical";
import {
  $isRangeSelection,
  $getSelection,
  COMMAND_PRIORITY_LOW,
  $getNodeByKey,
  $isTextNode,
} from "lexical";
import { COMMAND_PRIORITY_CRITICAL } from "lexical";
import { useEffect } from "react";
import { $isTargetWithinDecorator } from "./utils/unexported";

export function BackspacePlugin() {
  const [editor] = useRemdoLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        //TODO handled twice, here and below explain and move it to a separate file
        KEY_BACKSPACE_COMMAND,
        (event: KeyboardEvent | null) => {
          //do not allow to delete top level list item node as otherwise the document structure may be invalid
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const node = $getNodeByKey(selection.anchor.key);
          if (!$isListItemNode(node)) {
            return false;
          }
          if (
            !node.getPreviousSibling() &&
            node.getParent().getParent().getKey() === "root"
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand<KeyboardEvent>(
        //copied from lexical/packages/lexical-rich-text/src/index.ts
        //to change the behavior when backsapce is pressed at the beginning of a
        //list item node and delete the list item instead of outdenting it
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if ($isTargetWithinDecorator(event.target as HTMLElement)) {
            return false;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }
          event.preventDefault();
          // If caret is at the beginning of a list item, delete the list item
          // instead of outdenting or deleting a character. This matches RemDo's
          // expected behavior and avoids leaving empty nested lists behind.
          if (selection.isCollapsed() && selection.anchor.offset === 0) {
            const note = Note.from(selection.anchor.getNode());
            // Merge with previous sibling when present, unfolding it if needed
            if (note.prevSibling) {
              const prev = note.prevSibling;
              if (prev.folded) {
                prev.folded = false;
              }
              // Determine target note to receive the text: last child if exists, otherwise the prev itself
              let target = prev;
              const prevChildrenList = prev._getChildrenListNode(false as any);
              const lastChild = prevChildrenList?.getLastChild();
              if (lastChild) {
                target = Note.from(lastChild);
              }

              // Append current text to the target
              if (note.text) {
                target.text = target.text + note.text;
              }

              // Move current children under prev's children
              const currChildrenList = note._getChildrenListNode(false as any);
              if (currChildrenList) {
                const targetList = target._getChildrenListNode(true);
                const toMove = currChildrenList.getChildren();
                if (toMove.length > 0) {
                  targetList.append(...toMove);
                }
                currChildrenList.remove();
              }

              const li = note.lexicalNode;
              const parentList = li.getParent();
              li.remove();
              if (parentList.getChildrenSize() === 0) {
                parentList.remove();
              }
              // Place selection at end of target text to avoid cursor placeholders
              const targetText = target.lexicalNode
                .getChildren()
                .find((c) => $isTextNode(c));
              if (targetText) {
                (targetText as any).selectEnd();
              } else {
                target.lexicalNode.selectEnd();
              }
              return true;
            }
            // Only delete the list item when it has no previous sibling and is nested (not top-level)
            if (!note.isRoot && !note.prevSibling && !note.parent.isRoot) {
              const li = note.lexicalNode;
              const parentList = li.getParent();
              li.remove();
              if (parentList.getChildrenSize() === 0) {
                // remove empty container list left after deleting the only child
                parentList.remove();
              }
              return true;
            }
          }
          /* remdo customization - commented out code below
          const { anchor } = selection;
          const anchorNode = anchor.getNode();

          if (
            selection.isCollapsed() &&
            anchor.offset === 0 &&
            !$isRootNode(anchorNode)
          ) {
            const element = $getNearestBlockElementAncestorOrThrow(anchorNode);
            if (element.getIndent() > 0) {
              return editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
            }
          }
          remdo customization extra code below */
          const note = Note.from(selection.anchor.getNode());
          if (note?.prevSibling?.folded) {
            note.prevSibling.folded = false;
          }
          /* end of remdo customization */
          return editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor]);

  return null;
}
