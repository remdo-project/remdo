import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';

import { useEditorConfig } from './config';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { TreeViewPlugin } from './plugins/TreeViewPlugin';

interface EditorComposerProps {
  children?: React.ReactNode;
}

export function EditorComposer({ children }: EditorComposerProps) {
  const { initialConfig, dev } = useEditorConfig();

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-inner">
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <RootSchemaPlugin />
        <IndentationPlugin />
        <ListPlugin hasStrictIndent />
        {children}
        {dev && <TreeViewPlugin />}
      </div>
    </LexicalComposer>
  );
}

export default EditorComposer;
