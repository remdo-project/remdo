import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { useCallback, useState } from 'react';
import { createEditorInitialConfig } from '#client/editor/runtime/config';
import { CollaborationPlugin, useOfflineDocumentUnavailable } from '#client/editor/runtime/collaboration';
import { CheckListPlugin } from '#client/editor/features/checklist/CheckListPlugin';
import { IndentationPlugin } from '#client/editor/editing/indentation/IndentationPlugin';
import { DevEditorSeam } from './DevEditorSeam';
import { SelectionPlugin, SelectionInputPlugin } from '#client/editor/selection/SelectionPlugin';
import { SelectionCollapsePlugin } from '#client/editor/selection/SelectionCollapsePlugin';
import { InsertionPlugin } from '#client/editor/editing/insertion/InsertionPlugin';
import { DeletionPlugin } from '#client/editor/editing/deletion/DeletionPlugin';
import { DatePlugin } from '#client/editor/features/date/DatePlugin';
import { NoteBodyPlugin } from '#client/editor/features/note-body/NoteBodyPlugin';
import { LinksPlugin } from '#client/editor/features/links/LinksPlugin';
import { RootSchemaPlugin } from '#client/editor/plugins/RootSchemaPlugin';
import { NoteIdPlugin } from '#client/editor/runtime/note-ids/NoteIdPlugin';
import { ClipboardPlugin } from '#client/editor/editing/clipboard/ClipboardPlugin';
import { ReorderingPlugin } from '#client/editor/editing/reordering/ReorderingPlugin';
import { KeymapPlugin } from '#client/editor/plugins/KeymapPlugin';
import { StatusIndicators } from './StatusIndicators';
import { ZoomPlugin } from '#client/editor/features/zoom/ZoomPlugin';
import { ZoomVisibilityPlugin } from '#client/editor/features/zoom/ZoomVisibilityPlugin';
import { FoldingPlugin } from '#client/editor/features/folding/FoldingPlugin';
import { NoteControlsPlugin } from '#client/editor/features/menu/NoteControlsPlugin';
import { NoteMenuPlugin } from '#client/editor/features/menu/NoteMenuPlugin';
import { MobileActionToolbar } from '#client/editor/plugins/mobile-toolbar/MobileActionToolbar';
import { SearchCandidatesPlugin } from '#client/editor/features/search/SearchCandidatesPlugin';
import { PendingDocumentImportPlugin } from '#client/editor/plugins/PendingDocumentImportPlugin';
import './Editor.css';

interface EditorProps {
  docId: string;
  statusPortalRoot: HTMLElement | null;
  sourceOrigin?: string | null;
  sourceId?: string | null;
  searchModeRequested?: boolean;
  onPendingDocumentImportError?: (error: Error) => void;
}

export default function Editor({
  docId,
  statusPortalRoot,
  sourceOrigin = null,
  sourceId = null,
  searchModeRequested,
  onPendingDocumentImportError,
}: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig();

  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <CollaborationPlugin docId={docId} sourceOrigin={sourceOrigin} sourceId={sourceId}>
          <EditorRuntime
            docId={docId}
            searchModeRequested={searchModeRequested}
            statusPortalRoot={statusPortalRoot}
            onPendingDocumentImportError={onPendingDocumentImportError}
          />
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}

function EditorRuntime({
  docId,
  statusPortalRoot,
  searchModeRequested,
  onPendingDocumentImportError,
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
          <h2>Connection unavailable</h2>
          <p>This document isn&apos;t available offline yet.</p>
          <p>It will load once the RemDo server can be reached.</p>
        </section>
      ) : (
        <>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-input"
                autoCapitalize="sentences"
                autoCorrect="on"
                inputMode="text"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <RootSchemaPlugin onSchemaReadyChange={handleSchemaReadyChange} />
          {schemaReady ? (
            <>
              <NoteIdPlugin />
              <ClipboardPlugin />
              <KeymapPlugin />
              <IndentationPlugin />
              <ReorderingPlugin />
              <NoteBodyPlugin />
              <SelectionPlugin />
              <SelectionCollapsePlugin />
              <LinksPlugin />
              <DatePlugin />
              <InsertionPlugin />
              <DeletionPlugin />
              <SelectionInputPlugin />
              <FoldingPlugin />
              <NoteControlsPlugin />
              <NoteMenuPlugin />
              <MobileActionToolbar />
              <ZoomPlugin />
              <ZoomVisibilityPlugin />
              {searchModeRequested ? (
                <SearchCandidatesPlugin docId={docId} />
              ) : null}
              <CheckListPlugin />
              <ListPlugin hasStrictIndent />
              {onPendingDocumentImportError ? (
                <PendingDocumentImportPlugin onError={onPendingDocumentImportError} />
              ) : null}
              <DevEditorSeam />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
