import { ListItemNode } from '@lexical/list';
import type { SerializedListItemNode } from '@lexical/list';
import { $applyNodeReplacement, ElementNode } from 'lexical';
import type { EditorConfig, LexicalNode, SerializedElementNode } from 'lexical';

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

function $createNoteBodyNode(): NoteBodyNode {
  return $applyNodeReplacement(new NoteBodyNode());
}

export function $isNoteBodyNode(node: LexicalNode | null | undefined): node is NoteBodyNode {
  return node instanceof NoteBodyNode;
}

/**
 * The structural slot that attaches a body to its note: a dedicated list item
 * holding exactly one `NoteBodyNode`. It is a `ListItemNode` subclass because
 * `ListNode` requires its children to be list items, but it is NOT a note — it
 * carries no noteId, checkbox, or fold state, and its DOM never gets list-marker
 * or checkbox semantics, so the rest of the outline treats it as inert.
 */
export class BodyWrapperNode extends ListItemNode {
  $config() {
    return this.config('note-body-wrapper', { extends: ListItemNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('li');
    const className = config.theme.noteBodyWrapper;
    if (typeof className === 'string') {
      element.className = className;
    }
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  // A body-wrapper has no note identity or checkbox state, so its serialized
  // form is a plain element plus its NoteBodyNode child — the list item's
  // value/checked fields are deliberately omitted from the runtime shape.
  exportJSON(): SerializedListItemNode {
    return ElementNode.prototype.exportJSON.call(this) as SerializedListItemNode;
  }
}

export function isBodyWrapper(node: LexicalNode | null | undefined): node is BodyWrapperNode {
  return node instanceof BodyWrapperNode;
}

export function $createBodyWrapper(): BodyWrapperNode {
  const wrapper = $applyNodeReplacement(new BodyWrapperNode());
  wrapper.append($createNoteBodyNode());
  return wrapper;
}
