import { useMemo } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { ListItemNode, ListNode } from "@lexical/list";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import type { Provider } from "@lexical/yjs";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import TreeViewPlugin from "@/features/editor/devtools/TreeViewPlugin";
import { useDisableCollaboration } from "@/features/editor/config";

function createInitialState() {
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    root.append($createParagraphNode().append($createTextNode("hello world")));
  }
}

function createCollaborationProviderFactory(endpoint: string) {
  return (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
    let doc = yjsDocMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      yjsDocMap.set(id, doc);
    } else {
      doc.load();
    }

    const roomName = `playground/0/${id}`;
    console.warn("Collaboration endpoint:", endpoint);
    console.warn("Room name:", roomName);
    return new WebsocketProvider(endpoint, roomName, doc, {
      connect: false,
    }) as unknown as Provider;
  };
}

export function LexicalDemo() {
  const disableCollaboration = useDisableCollaboration();

  const collabConfig = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const endpoint = `${protocol}://${window.location.hostname}:8080`;

    return endpoint;
  }, []);

  const documentId = "main";

  const initialConfig = useMemo(() => ({
    namespace: "lexical-demo",
    onError(error: Error) {
      throw error;
    },
    nodes: [ListNode, ListItemNode],
    editorState: createInitialState,
  }), []);

  const providerFactory = useMemo(
    () => createCollaborationProviderFactory(collabConfig),
    [collabConfig],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-demo-container">
        <RichTextPlugin
          contentEditable={<ContentEditable className="lexical-demo-editor" />}
          placeholder={<div className="placeholder">Start typing...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        {disableCollaboration ? (
          <HistoryPlugin />
        ) : (
          <CollaborationPlugin
            id={documentId}
            providerFactory={providerFactory}
            shouldBootstrap={true}
            initialEditorState={createInitialState}
          />
        )}
        <TreeViewPlugin />
      </div>
    </LexicalComposer>
  );
}

export default LexicalDemo;
