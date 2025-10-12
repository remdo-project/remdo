import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';

import { useEditorConfig } from './config';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';

interface EditorComposerProps {
  extraPlugins?: React.ReactNode;
}

export function EditorComposer({ extraPlugins }: EditorComposerProps) {
  const initialConfig = useEditorConfig();

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-inner">
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <RootSchemaPlugin />
        <TabIndentationPlugin />
        <ListPlugin hasStrictIndent />
        {extraPlugins}
      </div>
    </LexicalComposer>
  );
}

export default EditorComposer;
