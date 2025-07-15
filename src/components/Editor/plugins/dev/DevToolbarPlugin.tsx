import { useRemdoLexicalComposerContext } from "../remdo/ComposerContext";
import { SPACER_COMMAND } from "../remdo/utils/commands";
import { YjsDebug } from "./YjsDebug";
import { useDebug } from "@/DebugContext";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSelector";
import { mergeRegister } from "@lexical/utils";
import { CONNECTED_COMMAND, TOGGLE_CONNECT_COMMAND } from "@lexical/yjs";
import {
  CLEAR_EDITOR_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as Y from "yjs";
import TreeViewPlugin from "./TreeViewPlugin";

function EditorStateInput() {
  const [editor] = useRemdoLexicalComposerContext();
  const loadEditorState = () => {
    const editorStateElement: HTMLTextAreaElement = document.getElementById(
      "editor-state"
    ) as HTMLTextAreaElement;
    const serializedEditorState = editorStateElement.value;
    const editorState = editor.parseEditorState(serializedEditorState);
    editor.setEditorState(editorState);
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, null);
    editorStateElement.value = "";
  };

  return (
    <div>
      <textarea id="editor-state"></textarea>
      <br />
      <button
        type="button"
        className="btn btn-primary"
        onClick={loadEditorState}
      >
        Submit Editor State
      </button>
    </div>
  );
}

export const DevToolbarPlugin = ({ editorBottomRef }) => {
  const [connected, setConnected] = useState(false);
  const [editor] = useRemdoLexicalComposerContext();
  const [darkMode, setDarkMode] = useState(getDarkMode());
  const [showEditorStateInput, setShowEditorStateInput] = useState(false);
  const documentSelector = useDocumentSelector();
  const { isDebugMode } = useDebug();
  const editorBottom = editorBottomRef.current;

  useEffect(() => {
    //the idea is to use it in browser console
    globalThis.debugEditor = editor;
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<boolean>(
        CONNECTED_COMMAND,
        (payload) => {
          const isConnected = payload;
          setConnected(isConnected);
          return false;
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand<void>(
        SPACER_COMMAND,
        () => {
          //do nothing, registration is needed so the command is shown in TreeView command log
          return false;
        },
        COMMAND_PRIORITY_EDITOR
      )
    );
  }, [editor]);

  function getDarkMode() {
    return document.documentElement.dataset.bsTheme === "dark";
  }

  const clearContent = () => {
    editor.update(() => {
      editor.dispatchCommand(SPACER_COMMAND, undefined);
      editor.dispatchCommand(SPACER_COMMAND, undefined);
      editor.dispatchCommand(SPACER_COMMAND, undefined);
      editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
    });
    const yjsDoc = documentSelector.getYjsDoc();
    if (yjsDoc) {
      const undoManager = new Y.UndoManager(yjsDoc.get("root"));
      undoManager.clear();
    }
  };

  const toggleEditorStateInput = (event) => {
    event.preventDefault();
    setShowEditorStateInput(!showEditorStateInput);
  };

  const toggleColorMode = useCallback(() => {
    document.documentElement.dataset.bsTheme = darkMode ? "light" : "dark";
    setDarkMode(getDarkMode());
  }, [darkMode]);

  return (
    isDebugMode && (
      <div className="d-none d-lg-block">
        <button
          type="button"
          className="btn btn-link float-end"
          onClick={toggleColorMode}
        >
          <i
            className={`bi bi-${
              darkMode ? "sun-fill" : "moon-stars-fill"
            } text-secondary`}
          ></i>
          {darkMode ? "Light" : "Dark"} Mode
        </button>
        <button
          type="button"
          className="btn btn-link float-end"
          onClick={clearContent}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn btn-link float-end"
          onClick={toggleEditorStateInput}
        >
          Load State
        </button>
        {editorBottom &&
          showEditorStateInput &&
          createPortal(<EditorStateInput />, editorBottom)}
        {editorBottom &&
          createPortal(<TreeViewPlugin />, editorBottom)}
        {editorBottom &&
          createPortal(<YjsDebug />, editorBottom)}
        <button
          type="button"
          className="btn btn-link float-end"
          onClick={() => {
            editor.dispatchCommand(TOGGLE_CONNECT_COMMAND, !connected);
          }}
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
      </div>
    )
  );
};
