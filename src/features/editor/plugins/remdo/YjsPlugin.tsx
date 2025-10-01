import { useEffect, useRef } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSessionProvider";

export function YjsPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const session = useDocumentSelector();
  const { synced, switchEpoch } = session;
  const previousSynced = useRef(false);
  const previousEpoch = useRef(switchEpoch);
  const internalNotifier = (session as typeof session & {
    _notifyEditorReady?: (epoch: number) => void;
  })._notifyEditorReady;

  useEffect(() => {
    if (previousEpoch.current !== switchEpoch) {
      previousEpoch.current = switchEpoch;
      previousSynced.current = false;
    }
  }, [switchEpoch]);

  useEffect(() => {
    if (!previousSynced.current && synced) {
      editor.dispatchCommand(YJS_SYNCED_COMMAND, undefined);
      if (typeof internalNotifier === "function") {
        queueMicrotask(() => {
          internalNotifier(switchEpoch);
        });
      }
    }
    previousSynced.current = synced;
  }, [editor, internalNotifier, switchEpoch, synced]);

  return null;
}
