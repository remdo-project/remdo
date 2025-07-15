import {
  DocumentSelectorProvider,
  useDocumentSelector,
} from "./DocumentSelector/DocumentSelector";
import "./Editor.scss";
import LexicalClickableLinkPlugin from "@lexical/react/LexicalClickableLinkPlugin";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { useRef } from "react";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { DevComponentTestPlugin } from "./plugins/dev/DevComponentTestPlugin";
import { DevToolbarPlugin } from "./plugins/dev/DevToolbarPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RemdoPlugin } from "./plugins/RemdoPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { useEditorConfig } from "./config";

function LexicalEditor() {
  const editorContainerRef = useRef();
  const editorBottomRef = useRef();
  const documentSelector = useDocumentSelector();
  const editorConfig = useEditorConfig();

  return (
    <LexicalComposer
      initialConfig={editorConfig}
      key={documentSelector.documentID}
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
        <ClearEditorPlugin />
        <ListPlugin />
        <LinkPlugin />
        <LexicalClickableLinkPlugin />
        <TabIndentationPlugin />
        {
          //TODO extract to config (all occurences)
          "__vitest_environment__" in globalThis ?
            (<HistoryPlugin />) : (
            <CollaborationPlugin
              id={documentSelector.documentID}
              providerFactory={documentSelector.yjsProviderFactory}
              shouldBootstrap={true}
            />
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
