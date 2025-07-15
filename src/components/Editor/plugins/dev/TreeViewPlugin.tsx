import { $isListItemNode } from '@lexical/list';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {TreeView} from '@lexical/react/LexicalTreeView';
import { LexicalNode } from 'lexical/packages/lexical/src';

function $customPrintNode(node: LexicalNode): string {
  if($isListItemNode(node)) {
    return `id:${node.__id} ${node.__folded ? "folded" : ""}`;
  }
  return '';
}

export default function TreeViewPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  return (
    <TreeView
      viewClassName="tree-view-output"
      treeTypeButtonClassName="debug-treetype-button"
      timeTravelPanelClassName="debug-timetravel-panel"
      timeTravelButtonClassName="debug-timetravel-button"
      timeTravelPanelSliderClassName="debug-timetravel-panel-slider"
      timeTravelPanelButtonClassName="debug-timetravel-panel-button"
      customPrintNode={$customPrintNode}
      editor={editor}
    />
  );
}

