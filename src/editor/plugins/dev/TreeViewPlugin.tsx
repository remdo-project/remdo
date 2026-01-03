import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TreeView } from '@lexical/react/LexicalTreeView';
import type { LexicalNode } from 'lexical';

import './TreeViewPlugin.css';
import { $getNoteId } from '#lib/editor/note-id-state';

const $printNoteId = (node: LexicalNode): string | undefined => {
  if (!$isListItemNode(node)) {
    return undefined;
  }

  const noteId = $getNoteId(node);
  return noteId ? `noteId:${noteId}` : undefined;
};

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
        customPrintNode={$printNoteId}
      />
    </section>
  );
}

export default TreeViewPlugin;
