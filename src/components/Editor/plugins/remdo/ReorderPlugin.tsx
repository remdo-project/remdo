import { useCallback, useEffect } from "react";
import { Note } from "./utils/api";
import { $getSelection, $isRangeSelection } from "lexical";
import { useRemdoLexicalComposerContext } from "./ComposerContext";

export function ReorderPlugin() {
  const [editor] = useRemdoLexicalComposerContext();

  const handleReorder = useCallback(
    //TODO convert that to custom commands
    //ARROW_UP and ARROW_DOWN commands can't be used here because they are not
    //triggered when meta key is pressed
    (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        !(event.altKey || event.shiftKey || event.ctrlKey)
      ) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            return false;
          }

          const nodesInSelection = selection.getNodes();
          const note = Note.from(nodesInSelection[0]);
          if (event.key === "ArrowDown") {
            note.moveDown();
          } else {
            note.moveUp();
          }
        });
      }
    },
    [editor]
  );
  useEffect(() => {
    editor.registerRootListener((root, prevRoot) => {
      root && root.addEventListener("keydown", handleReorder);
      prevRoot && prevRoot.removeEventListener("keydown", handleReorder);
    });
  }, [editor, handleReorder]
  );
  return null;
}
