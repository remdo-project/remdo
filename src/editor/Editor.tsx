import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationPlugin } from './plugins/collaboration';
import { CheckListPlugin } from './plugins/CheckListPlugin';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { DevPlugin } from './plugins/dev';
import { SelectionPlugin, SelectionInputPlugin } from './plugins/SelectionPlugin';
import { SelectionCollapsePlugin } from './plugins/SelectionCollapsePlugin';
import { InsertionPlugin } from './plugins/InsertionPlugin';
import { DeletionPlugin } from './plugins/DeletionPlugin';
import { NoteLinkPlugin } from './plugins/NoteLinkPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { NoteIdPlugin } from './plugins/NoteIdPlugin';
import { ReorderingPlugin } from './plugins/ReorderingPlugin';
import { KeymapPlugin } from './plugins/KeymapPlugin';
import { InternalLinkDocContextPlugin } from './plugins/InternalLinkDocContextPlugin';
import { StatusIndicators } from './StatusIndicators';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { ZoomPlugin } from './zoom/ZoomPlugin';
import { ZoomVisibilityPlugin } from './zoom/ZoomVisibilityPlugin';
import { FoldingPlugin } from './plugins/FoldingPlugin';
import { NoteControlsPlugin } from './plugins/NoteControlsPlugin';
import { NoteMenuPlugin } from './plugins/NoteMenuPlugin';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
  docId: string;
  onTestBridgeReady?: (api: unknown) => void;
  onTestBridgeDispose?: () => void;
  statusPortalRoot: HTMLElement | null;
  zoomNoteId?: string | null;
  onZoomNoteIdChange?: (noteId: string | null) => void;
  onZoomPathChange?: (path: NotePathItem[]) => void;
}

export default function Editor({
  children,
  docId,
  onTestBridgeReady,
  onTestBridgeDispose,
  statusPortalRoot,
  zoomNoteId,
  onZoomNoteIdChange,
  onZoomPathChange,
}: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig();
  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <CollaborationPlugin docId={docId}>
          <InternalLinkDocContextPlugin />
          <StatusIndicators portalRoot={statusPortalRoot} />
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <KeymapPlugin />
          <IndentationPlugin />
          <ReorderingPlugin />
          <SelectionPlugin />
          <SelectionCollapsePlugin />
          <NoteLinkPlugin />
          <ClickableLinkPlugin newTab={false} />
          <InsertionPlugin />
          <DeletionPlugin />
          <SelectionInputPlugin />
          <FoldingPlugin />
          <NoteControlsPlugin />
          <NoteMenuPlugin />
          <ZoomPlugin zoomNoteId={zoomNoteId} onZoomNoteIdChange={onZoomNoteIdChange} onZoomPathChange={onZoomPathChange} />
          <ZoomVisibilityPlugin zoomNoteId={zoomNoteId} />
          <CheckListPlugin />
          <ListPlugin hasStrictIndent />
          <RootSchemaPlugin />
          <NoteIdPlugin />
          <DevPlugin onTestBridgeReady={onTestBridgeReady} onTestBridgeDispose={onTestBridgeDispose}>{children}</DevPlugin>
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}
