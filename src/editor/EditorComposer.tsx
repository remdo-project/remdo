import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { CollaborationPlugin, CollaborationProvider } from './collaboration/CollaborationStatus';
import { useEditorConfig } from './config';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { SchemaValidationPlugin } from './plugins/SchemaValidationPlugin';
import { TreeViewPlugin } from './plugins/TreeViewPlugin';

interface EditorComposerProps {
  children?: React.ReactNode;
}

export function EditorComposer({ children }: EditorComposerProps) {
  const { initialConfig } = useEditorConfig();

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <CollaborationProvider>
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <RootSchemaPlugin />
          <IndentationPlugin />
          <ListPlugin hasStrictIndent />
          <CollaborationPlugin />
          {children}
          {import.meta.env.DEV && <SchemaValidationPlugin />}
          {import.meta.env.DEV && <TreeViewPlugin />}
        </div>
      </CollaborationProvider>
    </LexicalComposer>
  );
}

export default EditorComposer;
