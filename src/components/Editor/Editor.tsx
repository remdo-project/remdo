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
import { CollabElementNode } from "lexical/packages/lexical-yjs/src/CollabElementNode";
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
import { RemdoYJSPlugin } from "./plugins/RemdoYJS";

let yIDB = null;
if ("indexedDB" in window) {
  //import conditionally, because it breaks unit tests, where indexedDB is
  //neither available nor used
  yIDB = import("y-indexeddb");
}

/**
 * it would be easier to directly use binding from @lexical/yjs,
 * however there is not way to access it without patching the library
 */
type YJSData = {
  provider?: Provider;
  docMap?: Map<string, Doc>;
  docID?: string;
};

function shouldRendedNode(collabElementNode: CollabElementNode) {
  return !(
    collabElementNode._type === "list" &&
    (
      collabElementNode._children[0] as CollabElementNode
    )?._xmlText.getAttribute("__folded")
  );
}

/**
 * yes it does generate a factory with a fixed handler to yjsData
 * the idea is to pass the generated factory to the LexicalComposer
 */
function providerFactoryGenerator(
  yjsData: YJSData
): (id: string, yjsDocMap: Map<string, Doc>) => Provider {
  return function (id: string, yjsDocMap: Map<string, Doc>): Provider {
    //console.log("providerFactory", id);
    let doc = yjsDocMap.get(id);

    if (doc === undefined) {
      doc = new Doc();
      doc['shouldRenderNode'] = shouldRendedNode;
      yjsDocMap.set(id, doc);
    } else {
      doc.load();
    }

    if ("indexedDB" in window) {
      yIDB.then(({ IndexeddbPersistence }) => {
        new IndexeddbPersistence(id, doc);
      });
    } else if (!("__vitest_environment__" in globalThis)) {
      console.warn(
        "IndexedDB is not supported in this browser. Disabling offline mode."
      );
    }

    const wsURL = "ws://" + window.location.hostname + ":8080";
    const roomName = "notes/0/" + id;
    //console.log(`WebSocket URL: ${wsURL}/${roomName}`)
    const wsProvider = new WebsocketProvider(
      wsURL,
      roomName,
      doc,
      {
        connect: true,
      }
    );
    wsProvider.shouldConnect = true; //reconnect after disconnecting
    Object.assign(yjsData, {
      provider: wsProvider as unknown as Provider,
      docMap: yjsDocMap,
      docID: id,
    });
    //wsProvider.on("status", event => { console.log("wsProvider status", event) })
    //wsProvider.on("sync", event => { console.log("wsProvider sync", event) })
    //wsProvider.on("connecttion-close", event => { console.log("wsProvider connection close", event) })
    //wsProvider.on("connecttion-error", event => { console.log("wsProvider connection errror", event) })

    // @ts-ignore
    return wsProvider;
  };
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
  const [collabKey, setCollabKey] = useState(0);
  const yjsData: YJSData = {};
  const providerFactory = providerFactoryGenerator(yjsData);

  /**
   * forces a re-render of the CollaborationPlugin
   */
  function updateCollabKey() {
    setCollabKey(collabKey + 1);
  }

  const onRef = _floatingAnchorElem => {
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

    disableCollab: !!(import.meta as any).env.VITE_DISABLECOLLAB,
  };

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="editor-container editor-shell">
        <DevToolbarPlugin editorBottom={editorBottom} />
        {floatingAnchorElem && (
          <NotesPlugin
            anchorElement={floatingAnchorElem}
            documentID={documentID}
          />
        )}
        <RemdoYJSPlugin updateCollabKey={updateCollabKey} yjsData={yjsData} />
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
            key={collabKey}
          />
        )}
        <div id="editor-bottom" ref={setEditorBottom} />
      </div>
    </LexicalComposer>
  );
}
