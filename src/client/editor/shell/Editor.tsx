import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { useCallback, useEffect, useState } from 'react';
import { createEditorInitialConfig } from '#client/editor/runtime/config';
import { CollaborationPlugin, useOfflineDocumentUnavailable } from '#client/editor/runtime/collaboration';
import { CheckListPlugin } from '#client/editor/features/list-types/CheckListPlugin';
import { IndentationPlugin } from '#client/editor/editing/indentation/IndentationPlugin';
import { DevEditorSeam } from './DevEditorSeam';
import { SelectionPlugin, SelectionInputPlugin } from '#client/editor/outline/selection/SelectionPlugin';
import { SelectionCollapsePlugin } from '#client/editor/outline/selection/SelectionCollapsePlugin';
import { InsertionPlugin } from '#client/editor/editing/insertion/InsertionPlugin';
import { DeletionPlugin } from '#client/editor/editing/deletion/DeletionPlugin';
import { DatePlugin } from '#client/editor/features/date/DatePlugin';
import { NoteBodyPlugin } from '#client/editor/features/note-body/NoteBodyPlugin';
import { LinksPlugin } from '#client/editor/features/links/LinksPlugin';
import { RootSchemaPlugin } from '#client/editor/runtime/RootSchemaPlugin';
import { NoteIdPlugin } from '#client/editor/runtime/note-ids/NoteIdPlugin';
import { ClipboardPlugin } from '#client/editor/editing/clipboard/ClipboardPlugin';
import { ReorderingPlugin } from '#client/editor/editing/reordering/ReorderingPlugin';
import { KeymapPlugin } from '#client/editor/keymap/KeymapPlugin';
import { StatusIndicators } from './StatusIndicators';
import { ZoomPlugin } from '#client/editor/features/zoom/ZoomPlugin';
import { ZoomVisibilityPlugin } from '#client/editor/features/zoom/ZoomVisibilityPlugin';
import { FoldingPlugin } from '#client/editor/features/folding/FoldingPlugin';
import { NoteControlsPlugin } from '#client/editor/menu/NoteControlsPlugin';
import { NoteMenuPlugin } from '#client/editor/menu/NoteMenuPlugin';
import { MobileActionToolbarPlugin } from '#client/editor/mobile-toolbar/MobileActionToolbarPlugin';
import { PendingDocumentImportPlugin } from '#client/editor/runtime/PendingDocumentImportPlugin';
import { useLexicalOpenDocument } from '#client/editor/note-sdk-adapters';
import { useRegisterOpenDocument } from '#client/editor/view/EditorViewProvider';
import './Editor.css';

interface EditorProps {
  docId: string;
  accountId?: string;
  onSelectHome: () => void;
  statusPortalRoot: HTMLElement | null;
  onPendingDocumentImportError?: (error: Error) => void;
}

export default function Editor({
  docId,
  accountId,
  statusPortalRoot,
  onPendingDocumentImportError,
  onSelectHome,
}: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig();

  return (
    <div className="editor-container">
      {/* TODO(deps): migrate to LexicalExtensionComposer, which replaces LexicalComposer in Lexical 0.51; its
          ReactExtension owns content-editable and editor bootstrapping, so the move needs its own review with
          RichTextPlugin and CollaborationPluginV2. Probe: the migration passes test:e2e and test:collab. */}
      {/* eslint-disable-next-line ts/no-deprecated -- tracked above. */}
      <LexicalComposer initialConfig={editorInitialConfig}>
        <CollaborationPlugin docId={docId} accountId={accountId}>
          <EditorRuntime
            docId={docId}
            statusPortalRoot={statusPortalRoot}
            onPendingDocumentImportError={onPendingDocumentImportError}
            onSelectHome={onSelectHome}
          />
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}

function EditorRuntime({
  docId,
  statusPortalRoot,
  onPendingDocumentImportError,
  onSelectHome,
}: EditorProps) {
  const [editor] = useLexicalComposerContext();
  const [schemaReady, setSchemaReady] = useState(false);
  const openDocument = useLexicalOpenDocument({ editor, docId, ready: schemaReady });
  const registerOpenDocument = useRegisterOpenDocument();
  const offlineDocumentUnavailable = useOfflineDocumentUnavailable();
  const handleSchemaReadyChange = useCallback((ready: boolean) => {
    setSchemaReady(ready);
  }, []);

  useEffect(() => {
    if (!schemaReady) {
      return;
    }
    return registerOpenDocument(openDocument);
  }, [registerOpenDocument, schemaReady, openDocument]);

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
              <NoteMenuPlugin openDocument={openDocument} />
              <MobileActionToolbarPlugin openDocument={openDocument} />
              <ZoomPlugin onSelectHome={onSelectHome} />
              <ZoomVisibilityPlugin />
              <CheckListPlugin />
              <ListPlugin hasStrictIndent />
              {onPendingDocumentImportError ? (
                <PendingDocumentImportPlugin onError={onPendingDocumentImportError} />
              ) : null}
              <DevEditorSeam openDocument={openDocument} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
