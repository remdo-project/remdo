import {
  DocumentSelectorProvider,
  useDocumentSelector,
} from "./DocumentSelector/DocumentSessionProvider";
import { useCollabFactory } from "./collab/useCollabFactory";
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
import { useEditorConfig } from "./config";

function LexicalEditor() {
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorBottomRef = useRef<HTMLDivElement | null>(null);
  const session = useDocumentSelector();
  const collabDisabled = session.collabDisabled;
  const collabFactory = useCollabFactory();
  const editorConfig = useEditorConfig();
  const shouldMountTestBridge =
    !import.meta.env.PROD || (typeof window !== "undefined" && window.REMDO_TEST === true);
  const lexicalConfig = collabDisabled
    ? editorConfig
    : { ...editorConfig, collaboration: { providerFactory: collabFactory } };

  return (
    <LexicalComposer
      initialConfig={lexicalConfig}
      key={session.editorKey}
    >
      <div className="editor-container editor-shell">
        <DevToolbarPlugin editorBottomRef={editorBottomRef} />
        <RemdoPlugin
          anchorRef={editorContainerRef}
          documentID={session.id}
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
        {collabDisabled ? (
          <HistoryPlugin />
        ) : (
          <LexicalCollaboration>
            <CollaborationPlugin
              id={session.id}
              providerFactory={collabFactory}
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
