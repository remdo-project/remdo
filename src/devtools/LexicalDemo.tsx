import { useMemo } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { ListItemNode, ListNode } from "@lexical/list";
import TreeViewPlugin from "@/features/editor/devtools/TreeViewPlugin";
import { useDisableCollaboration } from "@/features/editor/config";
import {
  createCollaborationProviderFactory,
  getCollaborationEndpoint,
} from "@/features/editor/collab/createCollaborationProviderFactory";

export function LexicalDemo() {
  const disableCollaboration = useDisableCollaboration();
  const wsEndpoint = getCollaborationEndpoint();
  const documentId = "main";

  const initialConfig = useMemo(() => ({
    namespace: "lexical-demo",
    onError(error: Error) {
      throw error;
    },
    nodes: [ListNode, ListItemNode],
  }), []);

  const providerFactory = useMemo(
    () =>
      createCollaborationProviderFactory({
        endpoint: wsEndpoint,
      }),
    [wsEndpoint],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-demo-container">
        <RichTextPlugin
          contentEditable={<ContentEditable className="lexical-demo-editor" />}
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
          />
        )}
        <TreeViewPlugin />
      </div>
    </LexicalComposer>
  );
}

export default LexicalDemo;
