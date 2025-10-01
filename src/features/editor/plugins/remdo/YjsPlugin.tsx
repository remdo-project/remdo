import { useEffect, useRef } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSessionProvider";

export function YjsPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const session = useDocumentSelector();
  const { synced } = session;
  const previousSynced = useRef(false);

  useEffect(() => {
    if (!previousSynced.current && synced) {
      editor.dispatchCommand(YJS_SYNCED_COMMAND, undefined);
      queueMicrotask(() => {
        const internalSession = session as typeof session & {
          _notifyEditorReady?: (epoch: number) => void;
        };
        internalSession._notifyEditorReady?.(internalSession.switchEpoch);
      });
    }
    previousSynced.current = synced;
  }, [editor, session, synced]);

  return null;
}
