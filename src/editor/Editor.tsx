import type { EditorThemeClasses } from 'lexical';
import { ListItemNode, ListNode } from '@lexical/list';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';

import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { RootSchemaPlugin } from './RootSchemaPlugin';
import './Editor.css';

const theme: EditorThemeClasses = {
  root: 'editor-root',
  paragraph: 'editor-paragraph',
  text: {
    bold: 'text-bold',
    italic: 'text-italic',
    underline: 'text-underline',
    code: 'text-code',
  },
  list: {
    ul: 'list-ul',
    ol: 'list-ol',
    listitem: 'list-item',
    nested: {
      list: 'list-nested',
      listitem: 'list-nested-item',
    },
  },
};

function onError(error: Error) {
  if (import.meta.env.MODE !== 'production') {
    throw error;
  }
  console.error(error);
}

export default function Editor({ extraPlugins }: { extraPlugins?: React.ReactNode }) {
  const initialConfig = {
    namespace: 'lexical-basic-rich-text',
    theme,
    onError,
    nodes: [ListNode, ListItemNode],
  };

  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={initialConfig}>
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <RootSchemaPlugin />
          <TabIndentationPlugin />
          <ListPlugin />
          {extraPlugins}
        </div>
      </LexicalComposer>
    </div>
  );
}
