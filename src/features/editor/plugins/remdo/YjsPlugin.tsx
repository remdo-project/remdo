import { useEffect, useRef } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSessionProvider";

type SessionWithInternalNotify = ReturnType<typeof useDocumentSelector> & {
  _notifyEditorReady: (epoch: number) => void;
};

export function YjsPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const session = useDocumentSelector() as SessionWithInternalNotify;
  const { synced, switchEpoch } = session;
  const notifyEditorReady = session._notifyEditorReady;
  const previousSynced = useRef(false);

  useEffect(() => {
    if (!previousSynced.current && synced) {
      editor.dispatchCommand(YJS_SYNCED_COMMAND, undefined);
      queueMicrotask(() => {
        notifyEditorReady(switchEpoch);
      });
    }
    previousSynced.current = synced;
  }, [editor, notifyEditorReady, switchEpoch, synced]);

  return null;
}
