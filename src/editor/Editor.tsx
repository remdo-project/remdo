import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationPlugin } from './plugins/collaboration';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { DevPlugin } from './plugins/dev';
import { SelectionPlugin, SelectionInputPlugin } from './plugins/SelectionPlugin';
import { SelectionCollapsePlugin } from './plugins/SelectionCollapsePlugin';
import { InsertionPlugin } from './plugins/InsertionPlugin';
import { DeletionPlugin } from './plugins/DeletionPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { NoteIdPlugin } from './plugins/NoteIdPlugin';
import { ReorderingPlugin } from './plugins/ReorderingPlugin';
import { KeymapPlugin } from './plugins/KeymapPlugin';
import { StatusIndicators } from './StatusIndicators';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { ZoomPlugin } from './zoom/ZoomPlugin';
import { ZoomVisibilityPlugin } from './zoom/ZoomVisibilityPlugin';
import { FoldingPlugin } from './plugins/FoldingPlugin';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
  docId?: string;
  onTestBridgeReady?: (api: unknown) => void;
  onTestBridgeDispose?: () => void;
  zoomNoteId?: string | null;
  onZoomNoteIdChange?: (noteId: string | null) => void;
  onZoomPathChange?: (path: NotePathItem[]) => void;
}

export default function Editor({
  children,
  docId,
  onTestBridgeReady,
  onTestBridgeDispose,
  zoomNoteId,
  onZoomNoteIdChange,
  onZoomPathChange,
}: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig();
  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <CollaborationPlugin docId={docId}>
          <StatusIndicators />
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <KeymapPlugin />
          <IndentationPlugin />
          <ReorderingPlugin />
          <SelectionPlugin />
          <SelectionCollapsePlugin />
          <InsertionPlugin />
          <DeletionPlugin />
          <SelectionInputPlugin />
          <FoldingPlugin />
          <ZoomPlugin zoomNoteId={zoomNoteId} onZoomNoteIdChange={onZoomNoteIdChange} onZoomPathChange={onZoomPathChange} />
          <ZoomVisibilityPlugin zoomNoteId={zoomNoteId} />
          <ListPlugin hasStrictIndent />
          <RootSchemaPlugin />
          <NoteIdPlugin />
          <DevPlugin onTestBridgeReady={onTestBridgeReady} onTestBridgeDispose={onTestBridgeDispose}>{children}</DevPlugin>
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}
