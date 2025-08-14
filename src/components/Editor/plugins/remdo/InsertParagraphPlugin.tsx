import { useEffect } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, INSERT_PARAGRAPH_COMMAND } from "lexical";
import { Note } from "./utils/api";
import { $createListItemNode } from "@lexical/list";

export function InsertParagraphPlugin() {
  const [editor] = useRemdoLexicalComposerContext();

  useEffect(() => {
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        //this replaces $handleListInsertParagraph logic
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }
        const anchor = selection.anchor.getNode();
        if (selection.anchor.offset != anchor.getTextContentSize()) {
          return false;
        }

        const note = Note.from(anchor);

        if (note.hasChildren) {
          if (!note.folded) {
            //TODO use Note API to insert
            const newListItemNode = $createListItemNode();
            note._getChildrenListNode()?.getFirstChild()?.insertBefore(newListItemNode);
            newListItemNode.select();
          }
          else {
            note.parent.createChild().lexicalNode.select();
          }
          return true;
        }
        const newListItemNode = $createListItemNode();
        anchor.insertAfter(newListItemNode);
        newListItemNode.select();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
  });

  return null;
}
