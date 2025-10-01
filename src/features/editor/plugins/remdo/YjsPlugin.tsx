import { useEffect, useRef } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { useDocumentSessionInternal } from "../../DocumentSelector/DocumentSessionProvider";

export function YjsPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const session = useDocumentSessionInternal();
  const { synced } = session;
  const previousSynced = useRef(false);

  useEffect(() => {
    if (!previousSynced.current && synced) {
      editor.dispatchCommand(YJS_SYNCED_COMMAND, undefined);
      queueMicrotask(() => session._notifyEditorReady(session.switchEpoch));
    }
    previousSynced.current = synced;
  }, [editor, session, synced]);

  return null;
}
