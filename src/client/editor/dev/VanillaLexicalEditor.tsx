import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { TreeView } from '@lexical/react/LexicalTreeView';
import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list';
import { $createTextNode, $getRoot } from 'lexical';
import './VanillaLexicalEditor.css';

const initialConfig: InitialConfigType = {
  namespace: 'remdo-vanilla-lexical',
  theme: {},
  nodes: [ListNode, ListItemNode],
  editorState(editor) {
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const list = $createListNode('bullet');
      const item = $createListItemNode();
      item.append($createTextNode(''));
      list.append(item);
      root.append(list);
    });
  },
  onError(error) {
    throw error;
  },
};

export default function VanillaLexicalEditor() {
  return (
    <section className="vanilla-lexical">
      <div className="vanilla-lexical-shell">
        <LexicalComposer initialConfig={initialConfig}>
          <RichTextPlugin
            contentEditable={<ContentEditable className="vanilla-lexical-input" />}
            placeholder={<div className="vanilla-lexical-placeholder">Type some rich text...</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ListPlugin />
          <TabIndentationPlugin />
          <VanillaTreeView />
        </LexicalComposer>
      </div>
    </section>
  );
}

function VanillaTreeView() {
  const [editor] = useLexicalComposerContext();

  return (
    <section className="vanilla-lexical-tree" aria-label="Lexical tree view debugger">
      <TreeView
        editor={editor}
        viewClassName="vanilla-lexical-tree-body"
        treeTypeButtonClassName="vanilla-lexical-tree-hidden"
        timeTravelButtonClassName="vanilla-lexical-tree-hidden"
        timeTravelPanelButtonClassName="vanilla-lexical-tree-hidden"
        timeTravelPanelClassName="vanilla-lexical-tree-hidden"
        timeTravelPanelSliderClassName="vanilla-lexical-tree-hidden"
      />
    </section>
  );
}
