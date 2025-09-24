import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ListItemNode, ListNode } from "@lexical/list";
import { $createParagraphNode, $createTextNode, $getRoot, COMMAND_PRIORITY_LOW } from "lexical";
import type { Provider } from "@lexical/yjs";
import { CONNECTED_COMMAND } from "@lexical/yjs";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import TreeViewPlugin from "@/features/editor/devtools/TreeViewPlugin";

function createInitialState() {
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    root.append($createParagraphNode().append($createTextNode("hello world")));
  }
}

interface CollaborationProviderConfig {
  endpoint: string;
  roomSlug: string;
  collabId: string;
}

function createCollaborationProviderFactory({
  endpoint,
  roomSlug,
  collabId,
}: CollaborationProviderConfig) {
  console.warn("Collaboration endpoint:", endpoint);
  console.warn("Collaboration room:", `${roomSlug}/${collabId}`);
  return (id: string, yjsDocMap: Map<string, Y.Doc>): Provider => {
    let doc = yjsDocMap.get(id);
    if (!doc) {
      doc = new Y.Doc();
      yjsDocMap.set(id, doc);
    } else {
      doc.load();
    }

    const roomName = `${roomSlug}/${collabId}/${id}`;
    return new WebsocketProvider(endpoint, roomName, doc, {
      connect: false,
    }) as unknown as Provider;
  };
}

export function LexicalDemo() {
  const [searchParams] = useSearchParams();

  const collabConfig = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const defaultEndpoint = `${protocol}://${window.location.hostname}:8080`;
    const endpoint = searchParams.get("collabEndpoint") ?? defaultEndpoint;
    const roomSlug = searchParams.get("collabSlug") ?? "playground";
    const collabId = searchParams.get("collabId") ?? "0";

    return { endpoint, roomSlug, collabId } satisfies CollaborationProviderConfig;
  }, [searchParams]);

  const documentId = useMemo(
    () => searchParams.get("collabDocument") ?? "main",
    [searchParams],
  );

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
        <CollaborationPlugin
          id={documentId}
          providerFactory={providerFactory}
          shouldBootstrap={true}
          initialEditorState={createInitialState}
        />
        <CollaborationDebugPlugin />
        <TreeViewPlugin />
      </div>
    </LexicalComposer>
  );
}

function CollaborationDebugPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      CONNECTED_COMMAND,
      (payload: boolean) => {
        console.info("CONNECTED_COMMAND", payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

export default LexicalDemo;
