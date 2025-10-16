import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TreeView } from '@lexical/react/LexicalTreeView';

import './TreeViewPlugin.css';

export function TreeViewPlugin() {
  const [editor] = useLexicalComposerContext();

  return (
    <section className="editor-tree-view" aria-label="Lexical tree view debugger">
      <TreeView
        editor={editor}
        viewClassName="editor-tree-view-body"
        treeTypeButtonClassName="editor-tree-view-hidden"
        timeTravelButtonClassName="editor-tree-view-hidden"
        timeTravelPanelButtonClassName="editor-tree-view-hidden"
        timeTravelPanelClassName="editor-tree-view-hidden"
        timeTravelPanelSliderClassName="editor-tree-view-hidden"
      />
    </section>
  );
}

export default TreeViewPlugin;
