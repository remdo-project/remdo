import { $createListItemNode, $isListItemNode, ListItemNode } from '@lexical/list';
import {
  $applyNodeReplacement,
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type SerializedElementNode,
} from 'lexical';

export type SerializedNoteBodyNode = SerializedElementNode;

/**
 * A note body is a rich-text region attached to a note (see
 * `docs/outliner/body.md`). It is a normal Lexical `ElementNode`, so it lives in
 * the document's own tree and syncs through collaboration like any other
 * content. It is held by a dedicated body-wrapper `ListItemNode` placed adjacent
 * to the note's content item, mirroring the children-wrapper pattern, so it is
 * never mistaken for a content note.
 */
export class NoteBodyNode extends ElementNode {
  static getType(): string {
    return 'note-body';
  }

  static clone(node: NoteBodyNode): NoteBodyNode {
    return new NoteBodyNode(node.__key);
  }

  static importJSON(serializedNode: SerializedNoteBodyNode): NoteBodyNode {
    return $createNoteBodyNode().updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedNoteBodyNode {
    return super.exportJSON();
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('div');
    const className = config.theme.noteBody;
    if (typeof className === 'string') {
      element.className = className;
    }
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): false {
    return false;
  }

  canBeEmpty(): true {
    return true;
  }
}

export function $createNoteBodyNode(): NoteBodyNode {
  return $applyNodeReplacement(new NoteBodyNode());
}

export function $isNoteBodyNode(node: LexicalNode | null | undefined): node is NoteBodyNode {
  return node instanceof NoteBodyNode;
}

/**
 * A body-wrapper is a `ListItemNode` whose single child is a `NoteBodyNode`.
 * It is the structural slot that attaches a body to its note. Treated strictly
 * (exactly one child) for the same reason as children-wrappers: destructive
 * structural operations must never misclassify it.
 */
export function isBodyWrapper(node: LexicalNode | null | undefined): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }
  const children = node.getChildren();
  return children.length === 1 && $isNoteBodyNode(children[0]);
}

export function $createBodyWrapper(): ListItemNode {
  const wrapper = $createListItemNode();
  wrapper.append($createNoteBodyNode());
  return wrapper;
}
