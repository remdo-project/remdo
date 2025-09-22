// @ts-nocheck
// TODO(remdo): Type ReorderPlugin after consolidating drag-and-drop helpers with Lexical's command system.
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
    let activeRoot: HTMLElement | null = null;

    const unregisterRootListener = editor.registerRootListener((root, prevRoot) => {
      if (root) {
        // TODO: Evaluate replacing this DOM listener with a dedicated Lexical
        // command so the browser-event lint rule no longer complains about the
        // dynamic cleanup that registerRootListener performs for us.
        // eslint-disable-next-line react-web-api/no-leaked-event-listener
        root.addEventListener("keydown", handleReorder);
        activeRoot = root;
      }
      if (prevRoot) {
        prevRoot.removeEventListener("keydown", handleReorder);
        if (activeRoot === prevRoot) {
          activeRoot = null;
        }
      }
    });

    return () => {
      if (activeRoot) {
        activeRoot.removeEventListener("keydown", handleReorder);
        activeRoot = null;
      }
      unregisterRootListener();
    };
  }, [editor, handleReorder]);
  return null;
}
