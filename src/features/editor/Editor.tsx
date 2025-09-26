import {
  DocumentSelectorProvider,
  useDocumentSelector,
} from "./DocumentSelector/DocumentSelector";
import "./Editor.scss";
import { ClickableLinkPlugin as LexicalClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { useRef } from "react";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { DevComponentTestPlugin } from "./plugins/dev/DevComponentTestPlugin";
import { DevToolbarPlugin } from "./devtools/DevToolbarPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import RemdoTestBridge from "@/test-harness/RemdoTestBridge";
import { RemdoPlugin } from "./plugins/RemdoPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { RemdoListPlugin } from "./plugins/remdo/RemdoListPlugin";
import { useDisableCollaboration, useEditorConfig } from "./config";

function LexicalEditor() {
  const disableCollaboration = useDisableCollaboration();
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorBottomRef = useRef<HTMLDivElement | null>(null);
  const documentSelector = useDocumentSelector();
  const editorConfig = useEditorConfig();
  const shouldMountTestBridge =
    !import.meta.env.PROD || (typeof window !== "undefined" && window.REMDO_TEST === true);

  return (
    <LexicalComposer
      initialConfig={editorConfig}
      key={`${documentSelector.documentID}:${documentSelector.version}`}
    >
      <div className="editor-container editor-shell">
        <DevToolbarPlugin editorBottomRef={editorBottomRef} />
        <RemdoPlugin
          anchorRef={editorContainerRef}
          documentID={documentSelector.documentID}
        />
        <RichTextPlugin
          contentEditable={
            <div className="editor" ref={editorContainerRef}>
              <ContentEditable className="editor-input form-control" />
            </div>
          }
          placeholder={<div />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <DevComponentTestPlugin />
        {shouldMountTestBridge ? <RemdoTestBridge /> : null}
        <ClearEditorPlugin />
        <RemdoListPlugin />
        <LinkPlugin />
        <LexicalClickableLinkPlugin />
        <TabIndentationPlugin />
        {disableCollaboration ? (
          <HistoryPlugin />
        ) : (
          <LexicalCollaboration>
            <CollaborationPlugin
              id={documentSelector.documentID}
              providerFactory={documentSelector.yjsProviderFactory}
              shouldBootstrap
            />
          </LexicalCollaboration>
        )}
        <div id="editor-bottom" ref={editorBottomRef} />
      </div>
    </LexicalComposer>
  );
}

export default function Editor() {
  return (
    <DocumentSelectorProvider>
      <LexicalEditor />
    </DocumentSelectorProvider>
  );
}
