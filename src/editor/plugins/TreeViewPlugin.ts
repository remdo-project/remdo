import { TreeView } from 'lexical-vue/LexicalTreeView';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';
import { defineComponent, h } from 'vue';
import './TreeViewPlugin.css';

export const TreeViewPlugin = defineComponent({
  name: 'TreeViewPlugin',
  setup() {
    const editor = useLexicalComposer();

    return () =>
      h(
        'section',
        {
          class: 'editor-tree-view',
          'aria-label': 'Lexical tree view debugger',
        },
        [
          h(TreeView, {
            editor,
            viewClassName: 'editor-tree-view-body',
            treeTypeButtonClassName: 'editor-tree-view-hidden',
            timeTravelButtonClassName: 'editor-tree-view-hidden',
            timeTravelPanelButtonClassName: 'editor-tree-view-hidden',
            timeTravelPanelClassName: 'editor-tree-view-hidden',
            timeTravelPanelSliderClassName: 'editor-tree-view-hidden',
          }),
        ]
      );
  },
});
