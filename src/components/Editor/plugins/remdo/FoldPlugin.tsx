import { useRemdoLexicalComposerContext } from "@/components/Editor/plugins/remdo/ComposerContext";
import { Note, NotesState } from "@/components/Editor/plugins/remdo/utils/api";
import {
  NOTES_SET_FOLD_LEVEL_COMMAND,
  NOTES_TOGGLE_FOLD_COMMAND,
} from "./utils/commands";
import { mergeRegister } from "@lexical/utils";
import {
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { useEffect } from "react";

export function FoldPlugin() {
  const [editor] = useRemdoLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        NOTES_TOGGLE_FOLD_COMMAND,
        ({ noteKeys }) => {
          if (!noteKeys.length) {
            return false;
          }
          editor.fullUpdate(() => {
            const folded = !Note.from(noteKeys[0]).folded;
            noteKeys.forEach((key) => {
              Note.from(key).folded = folded;
            });
          });
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        NOTES_SET_FOLD_LEVEL_COMMAND,
        ({ level }) => {
          NotesState.getActive().focusNote.setFoldLevel(level);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
    );
  }, [editor]);

  return null;
}

