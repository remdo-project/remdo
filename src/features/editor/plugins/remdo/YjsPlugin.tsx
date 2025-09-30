// @ts-nocheck
// TODO(remdo): Restore YjsPlugin typing once collaboration wiring migrates to the new provider abstraction.
import { useEffect, useRef } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSessionProvider";

export function YjsPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const { synced } = useDocumentSelector();
  const previousSynced = useRef(false);

  useEffect(() => {
    if (!previousSynced.current && synced) {
      editor.dispatchCommand(YJS_SYNCED_COMMAND, undefined);
    }
    previousSynced.current = synced;
  }, [editor, synced]);

  return null;
}
