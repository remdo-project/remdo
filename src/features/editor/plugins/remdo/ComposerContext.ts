import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalComposerContextType } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor, EditorUpdateOptions } from "lexical";
import { FULL_RECONCILE } from "./utils/unexported";

export interface RemdoLexicalEditor extends LexicalEditor {
  //TODO try to remove
  fullUpdate(updateFunction: () => void, options?: EditorUpdateOptions): void;
}

export function useRemdoLexicalComposerContext() {
  const [editor, context] = useLexicalComposerContext() as [
    RemdoLexicalEditor,
    LexicalComposerContextType
  ];
  //TODO check if this is still needed
  editor.fullUpdate = (updateFunction, options) => {
    editor._dirtyType = FULL_RECONCILE;
    editor.update(() => {
      updateFunction();
    }, options);
  };
  return [editor, context] as [RemdoLexicalEditor, LexicalComposerContextType];
}
