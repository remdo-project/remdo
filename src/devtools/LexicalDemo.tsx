import { useCallback, useMemo } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import type { Provider } from "@lexical/yjs";
import { ListItemNode, ListNode } from "@lexical/list";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import TreeViewPlugin from "@/features/editor/devtools/TreeViewPlugin";

export function LexicalDemo() {
  const initialConfig = useMemo(() => ({
    namespace: "lexical-demo",
    onError(error: Error) {
      throw error;
    },
    editorState: null,
    nodes: [ListNode, ListItemNode],
  }), []);

  const providerFactory = useCallback((id: string, docMap: Map<string, Y.Doc>): Provider => {
    let doc = docMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      docMap.set(id, doc);
    }

    const endpoint = (() => {
      if (typeof window === "undefined") {
        return "ws://localhost:8080";
      }
      const { protocol, hostname } = window.location;
      const wsProtocol = protocol === "https:" ? "wss" : "ws";
      return `${wsProtocol}://${hostname}:8080`;
    })();

    const provider = new WebsocketProvider(endpoint, `${id}-3`, doc, {
      connect: false,
    });

    provider.on("status", (event: { status: string }) => {
      // eslint-disable-next-line no-console
      console.info(`Collaboration status for "${id}": ${event.status}`);
    });

    return provider as unknown as Provider;
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-demo-container">
        <RichTextPlugin
          contentEditable={<ContentEditable className="lexical-demo-editor" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <CollaborationPlugin
          id="lexical-demo-room"
          providerFactory={providerFactory}
          shouldBootstrap
        />
        <TreeViewPlugin />
      </div>
    </LexicalComposer>
  );
}

export default LexicalDemo;
