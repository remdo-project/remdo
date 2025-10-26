import { env } from '#config/env-client';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { CollaborationPlugin } from './plugins/collaboration';
import { useEditorConfig } from './config';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { SchemaValidationPlugin } from './plugins/SchemaValidationPlugin';
import { TreeViewPlugin } from './plugins/TreeViewPlugin';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
}

export default function Editor({ children }: EditorProps) {
  const { initialConfig } = useEditorConfig();

  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <IndentationPlugin />
        <ListPlugin hasStrictIndent />
        <CollaborationPlugin>
          <RootSchemaPlugin />
        </CollaborationPlugin>
        {children}
        {env.isDev && <SchemaValidationPlugin />}
        {env.isDev && <TreeViewPlugin />}
      </LexicalComposer>
    </div>
  );
}
