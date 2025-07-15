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

