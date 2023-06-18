import { useNotesLexicalComposerContext } from "@/components/Editor/lexical/NotesComposerContext";
import { REMDO_RELOAD_YJS_DOCUMENT } from "@/components/Editor/lexical/api";
import { mergeRegister } from "@lexical/utils";
import { TOGGLE_CONNECT_COMMAND } from "@lexical/yjs";
import { COMMAND_PRIORITY_LOW } from "lexical";
import { useEffect } from "react";

export function RemdoYJSPlugin({ updateCollabKey, yjsData }) {
  const [editor] = useNotesLexicalComposerContext();
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        REMDO_RELOAD_YJS_DOCUMENT,
        (documentID: string) => {
          const provider = yjsData.provider;
          console.log(documentID, yjsData.docMap)
          yjsData.docMap.delete(documentID);
          provider.emit("reload", [yjsData.docMap.get(documentID)]);
          editor.dispatchCommand(TOGGLE_CONNECT_COMMAND, false);
          updateCollabKey();
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  });

  return null;
}
