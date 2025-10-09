import type { EditorState, EditorThemeClasses } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';

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
};

function Placeholder() {
  return <div className="editor-placeholder">Type something… (⌘/Ctrl+B, I, U)</div>;
}

function onError(error: Error) {
  console.error(error);
}

export default function Editor() {
  const initialConfig = {
    namespace: 'lexical-basic-rich-text',
    theme,
    onError,
    nodes: [], // default paragraph/text nodes
  };

  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={initialConfig}>
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<Placeholder />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin onChange={(state: EditorState) => void state} />
        </div>
      </LexicalComposer>
    </div>
  );
}
