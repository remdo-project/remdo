import "lexical";
//TODO merge and remove alias
import {
  $createListItemNode,
  $createListNode,
  $isListNode,
} from "@lexical/list";
import { ListNode, ListItemNode as LexicalListItemNode } from "@lexical/list";
import {
  $getNodeByKey,
  $isTextNode,
  $createTextNode,
  EditorState,
  $getSelection,
  $isRangeSelection,
  $getEditor,
  $getNodeByKeyOrThrow,
  LexicalNode
} from "lexical";

import { $findNearestListItemNode, getElementByKeyOrThrow } from "./unexported";
import { $getNodeByID } from "./utils";
import { NOTES_FOCUS_COMMAND } from "./commands";

//TODO
//create folder api and split this to Note and NotesState

const ROOT_TEXT = "root";

interface NotesEditorState extends EditorState {
  _notesFilterChanged?: boolean;
}

export function getNotesEditorState() {
  return $getEditor().getEditorState() as NotesEditorState;
}

//TODO explain the difference between NotesEditorState and NotesState
export class NotesState {
  _element: HTMLElement;
  _focus: null | { nodeKey: string; parentKey: string } = null;

  constructor(element: HTMLElement) {
    this._element = element;
    this._readFocus();
  }

  get focus() {
    return this._focus;
  }

  get focusNote() {
    return new Note(this.focus?.nodeKey ?? "root");
  }

  _readFocus() {
    const focusNodeKey = this._element.dataset.focusNodeKey;
    this._focus =
      !focusNodeKey || focusNodeKey === "root"
        ? null
        : {
          nodeKey: focusNodeKey,
          parentKey: this._element.dataset.focusParentKey,
        };
  }

  _forceLexicalUpdate() {
    getNotesEditorState()._notesFilterChanged = true;
  }

  //TODO unused, check other focus related things from this class
  setFocus(note: Note) {
    //change notes state
    this._element.dataset.focusNodeKey = note.lexicalKey;
    this._element.dataset.focusParentKey = note.lexicalNode
      .getParent()
      ?.getKey();
    this._readFocus();
    this._forceLexicalUpdate();
  }

  static getActive() {
    //return new NotesState(getActiveEditor()._rootElement);
    return new NotesState($getEditor()._rootElement as HTMLElement);
  }

  static documents(): string[] {
    return ["main"].concat(
      (import.meta as any).env.VITE_DOCUMENTS?.split(",").filter(Boolean) ?? []
    );
  }
}

export class Note {
  _lexicalKey: string;

  //TODO remove
  static from(keyOrNode: LexicalNode | string): Note {
    const baseNode =
      typeof keyOrNode === "string"
        ? $getNodeByKey(keyOrNode as string)
        : keyOrNode;
    const liNode = $findNearestListItemNode(baseNode);

    return liNode ? new Note(liNode.getKey()) : new Note("root");
  }

  static fromLexicalKey(key: string): Note {
    return new Note(key);
  }

  static fromLexicalNode(node: LexicalNode): Note {
    const listItemNode = $findNearestListItemNode(node);
    if(!listItemNode) {
      throw new Error(`No list item node found for: ${node.getKey()}`);
    }
    return new Note(listItemNode.getKey());
  }

  static fromID(id: string): Note {
    const node = $getNodeByID(id);
    if (!node) {
      throw new Error(`Node not found for id: ${id}`);
    }
    return new Note(node.getKey());
  }

  constructor(key: string) {
    this._lexicalKey = key;
  }

  toJSON(): Record<string, any> {
    return {
      [this.text]: [...this.children].map(child => child.toJSON()),
    };
  }


  //TODO rename to createNote
  createChild(text: string | null = null): Note {
    const childNode = $createListItemNode();
    this._getChildrenListNode(true).append(childNode);
    if (text) {
      childNode.append($createTextNode(text));
    }
    return Note.from(childNode);
  }

  get isRoot(): boolean {
    return this.lexicalKey === "root";
  }

  get lexicalNode(): LexicalListItemNode {
    return $getNodeByKeyOrThrow(this._lexicalKey);
  }

  get lexicalKey() {
    return this._lexicalKey;
  }

  get parent(): Note {
    if (this.isRoot) {
      return null;
    }
    const lexicalParentNode = this.lexicalNode.getParent();
    return Note.from(lexicalParentNode.getKey());
  }

  get parents() {
    const that = this;
    return {
      *[Symbol.iterator]() {
        let parent = that.parent;
        while (parent) {
          yield parent;
          parent = parent.parent;
        }
      },
    };
  }

  get hasChildren(): boolean {
    return this._getChildrenListNode()?.getChildrenSize() > 0;
  }

  get children() {
    const that = this;
    return {
      *[Symbol.iterator]() {
        for (
          let child = that._getChildrenListNode()?.getFirstChild();
          child;
          child = child.getNextSibling()
        ) {
          yield Note.from(child);
        }
      },
    };
  }


  _getChildrenListNode(createIfNeeded = false): ListNode | null {
    let list = this.lexicalNode.getChildren().find($isListNode);
    if (!list && createIfNeeded) {
      list = $createListNode("bullet");
      this.lexicalNode.append(list);
    }
    return list;
  }

  get text() {
    //TODO use getTextContent
    if (this.isRoot) {
      return ROOT_TEXT;
    }
    return [
      ...this.lexicalNode
        .getChildren()
        .filter((child) => $isTextNode(child))
        .map((child) => child.getTextContent()),
    ].join("");
  }

  set text(value: string) {
    if (this.isRoot) {
      throw new Error("Can't set text on root note");
    }
    this.lexicalNode.clear();
    this.lexicalNode.append($createTextNode(value));
  }

  _appendChild(child: Note) {
    this._getChildrenListNode(true).append(child.lexicalNode);
  }

  _insertChild(child: Note) {
    this._getChildrenListNode(true).splice(0, 0, [child.lexicalNode]);
  }

  _insertNextSibling(noteToInsert: Note) {
    if (noteToInsert.isRoot) {
      throw new Error("Can't insert root note");
    }
    if (this.isRoot) {
      throw new Error("Can't insert after root note");
    }
    const prevParentList = noteToInsert.lexicalNode.getParent();
    this.lexicalNode.insertAfter(noteToInsert.lexicalNode);
    if (prevParentList.getChildrenSize() === 0) {
      prevParentList.remove();
    }
  }

  indent() {
    const prevSibling = this.lexicalNode.getPreviousSibling();
    if (prevSibling === null) {
      return;
    }
    Note.from(prevSibling)._appendChild(this);
  }

  outdent() {
    if (this.parent.isRoot) {
      return;
    }
    this.parent._insertNextSibling(this);
  }

  moveDown() {
    if (this.nextSibling) {
      this.nextSibling._insertNextSibling(this);
    }
    else {
      const parent = this.parent;
      parent.nextSibling?._insertChild(this);
      if (!parent.hasChildren) {
        parent._getChildrenListNode().remove();
      }
    }
  }

  moveUp() {
    if (this.prevSibling) {
      this.prevSibling.lexicalNode.insertBefore(this.lexicalNode);
    }
    else {
      const parent = this.parent;
      parent.prevSibling?._appendChild(this);
      if (!parent.hasChildren) {
        parent._getChildrenListNode().remove();
      }
    }
  }

  focus() {
    $getEditor().dispatchCommand(NOTES_FOCUS_COMMAND, { key: this.lexicalKey });
  }

  get folded() {
    return !this.isRoot && this.lexicalNode.getFolded();
  }

  //TODO add setFolded/getFolded to RootNode
  set folded(value: boolean) {
    if (!this.isRoot) {
      //TODO DOM manipulation should be done in createDOM
      //the problem is that folded note's children have display set to none
      //so they can be overwritten by Lexical reconciler
      getElementByKeyOrThrow(
        $getEditor(),
        this.lexicalKey
      ).classList.remove("note-folded");
      this.lexicalNode.setFolded(value && this.hasChildren);
    }
  }

  setFoldLevel(level: number) {
    this._walk(
      (note, currentLevel) =>
        !note.isRoot && (note.folded = currentLevel === 0),
      level === 0 ? -1 : level
    );
  }

  get checked() {
    return !this.isRoot && this.lexicalNode.getChecked();
  }

  set checked(value) {
    !this.isRoot && this._walk((note) => note.lexicalNode.setChecked(value));
  }

  toggleChecked() {
    if (this.isRoot) {
      return;
    }
    const checked = !this.checked;
    this._walk((note) => note.lexicalNode.setChecked(checked));
  }

  get prevSibling() {
    const sibling = this.lexicalNode.getPreviousSibling();
    return sibling ? Note.from(sibling) : null;
  }

  get nextSibling() {
    const sibling = this.lexicalNode.getNextSibling();
    return sibling ? Note.from(sibling) : null;
  }

  get id() {
    return this.isRoot ? "root" : this.lexicalNode.__id;
  }

  _walk(
    walker: (node: Note, currentLevel: number) => void,
    level = -1
  ) {
    walker(this, level);
    if (level === 0) {
      return;
    }
    for (const child of this.children) {
      child._walk(walker, level - 1);
    }
  }
}

export function getNotesFromSelection() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return [];
  }
  //TODO add support for multiple selection
  return [Note.from(selection.focus.key)];
}
