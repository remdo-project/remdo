import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { useCallback, useState } from 'react';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationPlugin, useOfflineDocumentUnavailable } from './plugins/collaboration';
import { CheckListPlugin } from './plugins/CheckListPlugin';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { DevPlugin } from './plugins/dev';
import { SelectionPlugin, SelectionInputPlugin } from './plugins/SelectionPlugin';
import { SelectionCollapsePlugin } from './plugins/SelectionCollapsePlugin';
import { InsertionPlugin } from './plugins/InsertionPlugin';
import { DeletionPlugin } from './plugins/DeletionPlugin';
import { LinksPlugin } from './plugins/LinksPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { NoteIdPlugin } from './plugins/NoteIdPlugin';
import { ReorderingPlugin } from './plugins/ReorderingPlugin';
import { KeymapPlugin } from './plugins/KeymapPlugin';
import { StatusIndicators } from './StatusIndicators';
import { ZoomPlugin } from './zoom/ZoomPlugin';
import { ZoomVisibilityPlugin } from './zoom/ZoomVisibilityPlugin';
import { FoldingPlugin } from './plugins/FoldingPlugin';
import { NoteControlsPlugin } from './plugins/NoteControlsPlugin';
import { NoteMenuPlugin } from './plugins/NoteMenuPlugin';
import { SearchCandidatesPlugin } from './plugins/SearchCandidatesPlugin';
import type { SearchCandidateSnapshot } from './search/search-candidates';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
  docId: string;
  onTestBridgeReady?: (api: unknown) => void;
  onTestBridgeDispose?: () => void;
  statusPortalRoot: HTMLElement | null;
  searchModeRequested?: boolean;
  onSearchCandidatesChange?: (snapshot: SearchCandidateSnapshot | null) => void;
}

export default function Editor({
  children,
  docId,
  onTestBridgeReady,
  onTestBridgeDispose,
  statusPortalRoot,
  searchModeRequested,
  onSearchCandidatesChange,
}: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig();

  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <CollaborationPlugin docId={docId}>
          <EditorRuntime
            children={children}
            docId={docId}
            onTestBridgeReady={onTestBridgeReady}
            onTestBridgeDispose={onTestBridgeDispose}
            searchModeRequested={searchModeRequested}
            statusPortalRoot={statusPortalRoot}
            onSearchCandidatesChange={onSearchCandidatesChange}
          />
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}

function EditorRuntime({
  children,
  docId,
  onTestBridgeReady,
  onTestBridgeDispose,
  statusPortalRoot,
  searchModeRequested,
  onSearchCandidatesChange,
}: EditorProps) {
  const offlineDocumentUnavailable = useOfflineDocumentUnavailable();
  const [schemaReady, setSchemaReady] = useState(false);
  const handleSchemaReadyChange = useCallback((ready: boolean) => {
    setSchemaReady(ready);
  }, []);

  return (
    <>
      <StatusIndicators portalRoot={statusPortalRoot} />
      {offlineDocumentUnavailable ? (
        <section className="editor-offline-empty-state" role="status" aria-live="polite">
          <h2>Offline</h2>
          <p>You&apos;re offline. This document has no local copy yet.</p>
          <p>Reconnect to load it.</p>
        </section>
      ) : (
        <>
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <RootSchemaPlugin onSchemaReadyChange={handleSchemaReadyChange} />
          {schemaReady ? (
            <>
              <NoteIdPlugin />
              <KeymapPlugin />
              <IndentationPlugin />
              <ReorderingPlugin />
              <SelectionPlugin />
              <SelectionCollapsePlugin />
              <LinksPlugin />
              <InsertionPlugin />
              <DeletionPlugin />
              <SelectionInputPlugin />
              <FoldingPlugin />
              <NoteControlsPlugin />
              <NoteMenuPlugin />
              <ZoomPlugin />
              <ZoomVisibilityPlugin />
              {searchModeRequested ? (
                <SearchCandidatesPlugin
                  docId={docId}
                  onCandidatesChange={onSearchCandidatesChange}
                />
              ) : null}
              <CheckListPlugin />
              <ListPlugin hasStrictIndent />
              <DevPlugin onTestBridgeReady={onTestBridgeReady} onTestBridgeDispose={onTestBridgeDispose}>
                {children}
              </DevPlugin>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
