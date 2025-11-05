import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TreeView } from '@lexical/react/LexicalTreeView';

import './TreeViewPlugin.css';

export function TreeViewPlugin() {
  const [editor] = useLexicalComposerContext();
  const hiddenClassName = 'editor-tree-view-hidden';

  return (
    <section className="editor-tree-view" aria-label="Lexical tree view debugger">
      <TreeView
        editor={editor}
        viewClassName="editor-tree-view-body"
        treeTypeButtonClassName={hiddenClassName}
        timeTravelButtonClassName={hiddenClassName}
        timeTravelPanelButtonClassName={hiddenClassName}
        timeTravelPanelClassName={hiddenClassName}
        timeTravelPanelSliderClassName={hiddenClassName}
      />
    </section>
  );
}

export default TreeViewPlugin;
