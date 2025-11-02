import { useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { config } from '#config/client';
import { createEditorInitialConfig } from '../../lib/editor/config';
import { CollaborationPlugin } from './plugins/collaboration';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { DevPlugin } from './plugins/DevPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
}

export default function Editor({ children }: EditorProps) {
  const editorInitialConfig = useMemo(
    () => createEditorInitialConfig({ isDev: config.isDev }),
    []
  );
  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <IndentationPlugin />
        <ListPlugin hasStrictIndent />
        <CollaborationPlugin>
          <RootSchemaPlugin />
          <DevPlugin>{children}</DevPlugin>
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}
