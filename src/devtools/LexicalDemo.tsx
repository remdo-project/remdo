import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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

function useDisableCollaboration(): boolean {
  const [searchParams] = useSearchParams();

  // intentionally set it on the first render, so further actions
  // like focusing on a particular node, won't impact the setting even if the
  // url changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => searchParams.get("ws") === "false", []);
}

function createInitialState() {
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    root.append($createParagraphNode().append($createTextNode("hello world")));
  }
}

function createCollaborationProviderFactory(endpoint: string) {
  return (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
    const doc = yjsDocMap.get(id) ?? new Y.Doc({ gc: false });
    yjsDocMap.set(id, doc);

    // Lexical's Yjs binding expects the shared root to be a Y.XmlText node.
    doc.get("root", Y.XmlText);

    const provider = new WebsocketProvider(endpoint, `lexical-demo/${id}`, doc, {
      connect: true,
    });
    provider.shouldConnect = true;

    return provider;
  };
}

export function LexicalDemo() {
  const disableCollaboration = useDisableCollaboration();

  const collabEndpoint = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:8080`;
  }, []);

  const initialConfig = useMemo(() => ({
    namespace: "lexical-demo",
    onError(error: Error) {
      throw error;
    },
    nodes: [ListNode, ListItemNode],
    editorState() {
      createInitialState();
    },
  }), []);

  const providerFactory = useMemo(
    () => createCollaborationProviderFactory(collabEndpoint),
    [collabEndpoint],
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
            id="lexical-demo"
            providerFactory={providerFactory}
            shouldBootstrap={true}
            initialEditorState={createInitialState}
          />
        )}
      </div>
    </LexicalComposer>
  );
}

export default LexicalDemo;
