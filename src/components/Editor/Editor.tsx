import "./Editor.scss";
import { ListNode, ListItemNode } from "@lexical/list";
import FloatingTextFormatToolbarPlugin from "@lexical/playground/plugins/FloatingTextFormatToolbarPlugin";
import "@lexical/playground/plugins/FloatingTextFormatToolbarPlugin/index.css";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { Provider } from "@lexical/yjs";
import { TextNode } from "lexical";
import { useState } from "react";
import React from "react";
import { useLocation } from "react-router-dom";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { applyNodePatches } from "./lexical/nodes";
import { DevComponentTestPlugin } from "./plugins/DevComponentTestPlugin";
import { DevToolbarPlugin } from "./plugins/DevToolbarPlugin";
import IndentationPlugin from "./plugins/IndentationPlugin";
import { NotesPlugin } from "./plugins/NotesPlugin";
import { QuickMenuPlugin } from "./plugins/QuickMenuPlugin";
import Document from "../Document";
import { YJSProvider} from "@/contexts/YJSContext";

let yIDB = null;
if ("indexedDB" in window) {
  //import conditionally, because it breaks unit tests, where indexedDB is
  //neither available nor used
  yIDB = import("y-indexeddb");
}

function providerFactory(id: string, yjsDocMap: Map<string, Doc>): Provider {
  //console.log("providerFactory", id);
  let doc = yjsDocMap.get(id);

  if (doc === undefined) {
    doc = new Doc();
    yjsDocMap.set(id, doc);
  } else {
    doc.load();
  }

  /* FIXME
  if ("indexedDB" in window) {
    yIDB.then(({ IndexeddbPersistence }) => {
      new IndexeddbPersistence(id, doc);
    });
  } else if (!("__vitest_environment__" in globalThis)) {
    console.warn(
      "IndexedDB is not supported in this browser. Disabling offline mode."
    );
  }
  */

  const wsURL = "ws://" + window.location.hostname + ":8080";
  const roomName = "notes/0/" + id;
  //console.log(`WebSocket URL: ${wsURL}/${roomName}`)
  const wsProvider = new WebsocketProvider(wsURL, roomName, doc, {
    connect: true,
  });
  wsProvider.shouldConnect = true; //reconnect after disconnecting

  /*
  const events = ["status", "synced", "sync", "update", "error", "destroy", "reload"];
  events.forEach((event) => {
    wsProvider.on(event, () => {
      console.log("wsProvider", event);
    });
  });
  */

  // @ts-ignore
  return wsProvider;
}

function Placeholder() {
  return <div className="editor-placeholder">Enter some plain text...</div>;
}

//TODO move it higher, to a ts file
applyNodePatches(TextNode);
applyNodePatches(ListNode);
applyNodePatches(ListItemNode);

export default function Editor() {
  const [floatingAnchorElem, setFloatingAnchorElem] = useState(null);
  const [editorBottom, setEditorBottom] = useState(null);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const documentID = params.get("documentID") || "main";

  const onRef = (_floatingAnchorElem) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  const editorConfig: InitialConfigType & { disableCollab: boolean } = {
    onError(error) {
      throw error;
    },
    namespace: "notes",
    nodes: [ListItemNode, ListNode],
    theme: {
      list: {
        listitemChecked: "li-checked",
        nested: {
          listitem: "position-relative li-nested",
        },
        ol: "editor-list-ol",
      },
      text: {
        bold: "font-weight-bold",
        code: "",
        italic: "font-italic",
        strikethrough: "strikethrough",
        subscript: "subscript",
        superscript: "superscript",
        underline: "underline",
        underlineStrikethrough: "underline strikethrough",
      },
    },
    editorState: null,
    disableCollab: true,
  };

  return (
    <div>
      <YJSProvider docID="main">
        <Document />
        <LexicalComposer initialConfig={editorConfig}>
          <div className="editor-container editor-shell">
            <DevToolbarPlugin editorBottom={editorBottom} />
            {floatingAnchorElem && (
              <NotesPlugin
                anchorElement={floatingAnchorElem}
                documentID={documentID}
              />
            )}
            <QuickMenuPlugin />
            <RichTextPlugin
              contentEditable={
                <div className="editor" ref={onRef}>
                  <ContentEditable className="editor-input form-control" />
                </div>
              }
              placeholder={<Placeholder />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <DevComponentTestPlugin />
            <FloatingTextFormatToolbarPlugin />
            <ClearEditorPlugin />
            <ListPlugin />
            <TabIndentationPlugin />
            <IndentationPlugin />
            {editorConfig.disableCollab ? (
              <HistoryPlugin />
            ) : (
              <CollaborationPlugin
                id={documentID}
                providerFactory={providerFactory}
                shouldBootstrap={true}
              />
            )}
            <div id="editor-bottom" ref={setEditorBottom} />
          </div>
        </LexicalComposer>
      </YJSProvider>
    </div>
  );
}
