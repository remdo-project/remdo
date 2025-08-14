import { useRemdoLexicalComposerContext } from "@/components/Editor/plugins/remdo/ComposerContext";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import {
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  $isRangeSelection,
  $getSelection,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { useEffect } from "react";

export function CheckPlugin() {
  const [editor] = useRemdoLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<KeyboardEvent>(
      KEY_ENTER_COMMAND,
      (event) => {
        //toggle check
        if (!event.metaKey) {
          return false;
        }
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        event.preventDefault();

        const { anchor } = selection;
        const note = Note.from(anchor.getNode());
        note.toggleChecked();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}
