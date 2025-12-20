import { Group } from '@mantine/core';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationConnectionStatus, CollaborationPlugin } from './plugins/collaboration';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { DevPlugin } from './plugins/dev';
import { SelectionPlugin, SelectionInputPlugin } from './plugins/SelectionPlugin';
import { InsertionPlugin } from './plugins/InsertionPlugin';
import { DeletionPlugin } from './plugins/DeletionPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { ReorderingPlugin } from './plugins/ReorderingPlugin';
import { KeymapPlugin } from './plugins/KeymapPlugin';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
  collabOrigin?: string;
  docId?: string;
  onTestBridgeReady?: (api: unknown) => void;
  onTestBridgeDispose?: () => void;
}

export default function Editor({ children, collabOrigin, docId, onTestBridgeReady, onTestBridgeDispose }: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig();
  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <CollaborationPlugin collabOrigin={collabOrigin} docId={docId}>
          <Group justify="flex-end" className="editor-header">
            <CollaborationConnectionStatus />
          </Group>
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <KeymapPlugin />
          <IndentationPlugin />
          <ReorderingPlugin />
          <SelectionPlugin />
          <InsertionPlugin />
          <DeletionPlugin />
          <SelectionInputPlugin />
          <ListPlugin hasStrictIndent />
          <RootSchemaPlugin />
          <DevPlugin onTestBridgeReady={onTestBridgeReady} onTestBridgeDispose={onTestBridgeDispose}>{children}</DevPlugin>
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}
