import {
  NotesState,
  getNotesEditorState,
  REMDO_RELOAD_YJS_DOCUMENT,
} from "./api";
import { FULL_RECONCILE } from "@lexical/LexicalConstants";
import { EditorUpdateOptions } from "@lexical/LexicalEditor";
import {
  LexicalComposerContextType,
  useLexicalComposerContext,
} from "@lexical/react/LexicalComposerContext";
import invariant from "@lexical/shared/invariant";
import { LexicalEditor } from "lexical";
import { useEffect } from "react";

export interface NotesLexicalEditor extends LexicalEditor {
  fullUpdate(updateFunction: () => void, options?: EditorUpdateOptions): void;
}

export function useNotesLexicalComposerContext() {
  const [editor, context] = useLexicalComposerContext() as [
    NotesLexicalEditor,
    LexicalComposerContextType
  ];
  //TODO check if this is still needed
  editor.fullUpdate = (updateFunction, options) => {
    editor._dirtyType = FULL_RECONCILE;
    editor.update(() => {
      NotesState.getActive()._forceLexicalUpdate();
      updateFunction();
    }, options);
  };

  useEffect(() =>
    editor.registerUpdateListener(({ editorState }) => {
      //intentionally handled here after update is complete, regardless 
      //if it's discrete or not
      if (editorState["_remdoReloadYJSDoc"]) {
        editor.dispatchCommand(REMDO_RELOAD_YJS_DOCUMENT, null);
      }
    })
  );

  return [editor, context] as [NotesLexicalEditor, LexicalComposerContextType];
}
