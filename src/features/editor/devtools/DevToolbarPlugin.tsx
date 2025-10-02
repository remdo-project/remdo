// @ts-nocheck
// TODO(remdo): Annotate DevToolbarPlugin once the developer tooling utilities are migrated to TypeScript-safe APIs.
import { useRemdoLexicalComposerContext } from "../plugins/remdo/ComposerContext";
import { SPACER_COMMAND } from "../plugins/remdo/utils/commands";
import { YjsDebug } from "./YjsDebug";
import { useDebug } from "@/DebugContext";
import { mergeRegister } from "@lexical/utils";
import { CONNECTED_COMMAND, TOGGLE_CONNECT_COMMAND } from "@lexical/yjs";
import {
  $getRoot,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TreeViewPlugin from "./TreeViewPlugin";

export const DevToolbarPlugin = ({ editorBottomRef }) => {
  const [connected, setConnected] = useState(false);
  const [editor] = useRemdoLexicalComposerContext();
  const [darkMode, setDarkMode] = useState(() => getDarkMode());
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
      const root = $getRoot();
      root.clear();
    });
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
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
            className={`bi bi-${darkMode ? "sun-fill" : "moon-stars-fill"
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
