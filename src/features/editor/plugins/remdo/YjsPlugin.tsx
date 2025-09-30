// @ts-nocheck
// TODO(remdo): Restore YjsPlugin typing once collaboration wiring migrates to the new provider abstraction.
import { useEffect } from "react";
import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSessionProvider";

export function YjsPlugin() {
  const [editor] = useRemdoLexicalComposerContext();
  const documentSelector = useDocumentSelector();
  const provider = documentSelector.yjsProvider;

  useEffect(() => {
    if (!provider) {
      return;
    }
    const handleSynced = () => {
      editor.dispatchCommand(YJS_SYNCED_COMMAND, undefined);
    };
    provider.on("synced", handleSynced);
    return () => {
      provider.off("synced", handleSynced);
    };
  }, [provider, editor]);

  return null;
}
