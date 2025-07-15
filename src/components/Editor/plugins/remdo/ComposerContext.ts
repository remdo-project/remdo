import {
  LexicalComposerContextType,
  useLexicalComposerContext,
} from "@lexical/react/LexicalComposerContext";
import { LexicalEditor } from "lexical";
import { EditorUpdateOptions } from "@lexical/LexicalEditor";
import { FULL_RECONCILE } from "./utils/unexported";

export interface RemdoLexicalEditor extends LexicalEditor {
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
