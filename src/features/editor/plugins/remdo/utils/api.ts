// @ts-nocheck
// TODO(remdo): Introduce strongly typed Remdo note APIs so this module can compile without suppressing type checking.
import "lexical";
//TODO merge and remove alias
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListNode,
  ListItemNode as LexicalListItemNode,
} from "@lexical/list";
import {
  $getNodeByKey,
  $isTextNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $getEditor,
  $getNodeByKeyOrThrow,
} from "lexical";
import type { EditorState, LexicalNode } from "lexical";

import {
  $findNearestListItemNode,
  getElementByKeyOrThrow,
  isNestedListNode,
} from "./unexported";
import { $getNodeByID } from "./utils";
import { NOTES_FOCUS_COMMAND } from "./commands";
import {
  $ensureNoteID,
  $getNoteID,
  $isNoteFolded,
  $setNoteFolded,
  $getNoteChecked,
  $setNoteChecked,
} from "./noteState";

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
    if (typeof childNode.setIndent === "function") {
      const parentIndent = this.isRoot
        ? -1
        : typeof this.lexicalNode.getIndent === "function"
          ? this.lexicalNode.getIndent()
          : 0;
      childNode.setIndent(Math.max(parentIndent + 1, 0));
    }
    $ensureNoteID(childNode);
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
    const parentList = this.lexicalNode.getParent();
    if (!$isListNode(parentList)) {
      return Note.from("root");
    }
    const containerListItem = $findNearestListItemNode(parentList);
    if (!$isListItemNode(containerListItem)) {
      return Note.from("root");
    }
    if (isContainerListItem(containerListItem)) {
      const previousSibling = getPreviousNoteListItem(containerListItem);
      if ($isListItemNode(previousSibling)) {
        return Note.from(previousSibling);
      }
      return Note.from("root");
    }
    return Note.from(containerListItem);
  }

  get parents() {
    function* iterateParents(note: Note) {
      let parent = note.parent;
      while (parent) {
        yield parent;
        parent = parent.parent;
      }
    }

    return {
      [Symbol.iterator]: () => iterateParents(this),
    };
  }

  get hasChildren(): boolean {
    return this._getChildrenListNode()?.getChildrenSize() > 0;
  }

  get children() {
    function* iterateChildren(note: Note) {
      for (
        let child = note._getChildrenListNode()?.getFirstChild();
        child;
        child = child.getNextSibling()
      ) {
        if (isContainerListItem(child)) {
          continue;
        }
        yield Note.from(child);
      }
    }

    return {
      [Symbol.iterator]: () => iterateChildren(this),
    };
  }


  _getChildrenListNode(createIfNeeded = false): ListNode | null {
    if (this.isRoot) {
      let rootList = this.lexicalNode.getChildren().find($isListNode);
      if (!rootList && createIfNeeded) {
        rootList = $createListNode("bullet");
        this.lexicalNode.append(rootList);
      }
      return rootList ?? null;
    }

    const directList = this.lexicalNode.getChildren().find($isListNode);
    if (directList) {
      return directList;
    }

    const siblingContainer = getChildrenContainer(this.lexicalNode);
    if (siblingContainer) {
      return siblingContainer.getFirstChild();
    }

    if (!createIfNeeded) {
      return null;
    }

    const parentList = this.lexicalNode.getParent();
    if (!$isListNode(parentList)) {
      return null;
    }

    const wrapper = $createListItemNode();
    const nestedList = $createListNode(parentList.getListType());

    wrapper.append(nestedList);
    this.lexicalNode.insertAfter(wrapper);
    return nestedList;
  }

  _removeChildrenList(list: ListNode | null = null) {
    const targetList = list ?? this._getChildrenListNode();
    if (!targetList) {
      return;
    }
    const container = targetList.getParent();
    targetList.remove();
    if ($isListItemNode(container) && isContainerListItem(container)) {
      container.remove();
    }
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
    const childContainer = getChildrenContainer(child.lexicalNode);
    const list = this._getChildrenListNode(true);
    list.append(child.lexicalNode);
    if (childContainer) {
      child.lexicalNode.insertAfter(childContainer);
    }
    const parentIndent = this.isRoot
      ? -1
      : typeof this.lexicalNode.getIndent === "function"
        ? this.lexicalNode.getIndent()
        : 0;
    if (typeof child.lexicalNode.setIndent === "function") {
      child.lexicalNode.setIndent(Math.max(parentIndent + 1, 0));
    }
  }

  _insertChild(child: Note) {
    const childContainer = getChildrenContainer(child.lexicalNode);
    const list = this._getChildrenListNode(true);
    list.splice(0, 0, [child.lexicalNode]);
    if (childContainer) {
      child.lexicalNode.insertAfter(childContainer);
    }
    const parentIndent = this.isRoot
      ? -1
      : typeof this.lexicalNode.getIndent === "function"
        ? this.lexicalNode.getIndent()
        : 0;
    if (typeof child.lexicalNode.setIndent === "function") {
      child.lexicalNode.setIndent(Math.max(parentIndent + 1, 0));
    }
  }

  _insertNextSibling(noteToInsert: Note) {
    if (noteToInsert.isRoot) {
      throw new Error("Can't insert root note");
    }
    if (this.isRoot) {
      throw new Error("Can't insert after root note");
    }
    const childContainer = getChildrenContainer(noteToInsert.lexicalNode);
    const prevParentList = noteToInsert.lexicalNode.getParent();
    const prevContainer = prevParentList?.getParent();
    this.lexicalNode.insertAfter(noteToInsert.lexicalNode);
    if (childContainer) {
      noteToInsert.lexicalNode.insertAfter(childContainer);
    }
    if (typeof noteToInsert.lexicalNode.setIndent === "function") {
      const currentIndent =
        typeof this.lexicalNode.getIndent === "function"
          ? this.lexicalNode.getIndent()
          : 0;
      noteToInsert.lexicalNode.setIndent(currentIndent);
    }
    cleanupEmptyList(prevParentList, prevContainer);
  }

  indent() {
    const prevSibling = this.lexicalNode.getPreviousSibling();
    const targetSibling = getPreviousNoteListItem(prevSibling);
    if (!$isListItemNode(targetSibling)) {
      return;
    }
    const parentListBefore = this.lexicalNode.getParent();
    const parentContainerBefore = parentListBefore?.getParent();
    Note.from(targetSibling)._appendChild(this);
    cleanupEmptyList(parentListBefore, parentContainerBefore);
  }

  outdent() {
    const currentIndent =
      typeof this.lexicalNode.getIndent === "function"
        ? this.lexicalNode.getIndent()
        : 0;
    if (currentIndent === 0) {
      return;
    }

    const parentList = this.lexicalNode.getParent();
    const containerListItem = parentList?.getParent();
    const childContainer = getChildrenContainer(this.lexicalNode);
    if ($isListItemNode(containerListItem)) {
      const grandparentList = containerListItem.getParent();
      if ($isListNode(grandparentList)) {
        containerListItem.insertBefore(this.lexicalNode);
        if (childContainer) {
          this.lexicalNode.insertAfter(childContainer);
        }
        if (typeof this.lexicalNode.setIndent === "function") {
          this.lexicalNode.setIndent(Math.max(currentIndent - 1, 0));
        }
        cleanupEmptyList(parentList, containerListItem);
        return;
      }
    }

    if (this.parent.isRoot) {
      return;
    }
    this.parent._insertNextSibling(this);
    if (typeof this.lexicalNode.setIndent === "function") {
      this.lexicalNode.setIndent(Math.max(currentIndent - 1, 0));
    }
  }

  moveDown() {
    if (this.nextSibling) {
      this.nextSibling._insertNextSibling(this);
    }
    else {
      const parent = this.parent;
      parent.nextSibling?._insertChild(this);
      if (!parent.hasChildren) {
        parent._removeChildrenList();
      }
    }
  }

  moveUp() {
    const parentListBefore = this.lexicalNode.getParent();
    const parentContainerBefore = parentListBefore?.getParent();
    const childContainer = getChildrenContainer(this.lexicalNode);
    if (this.prevSibling) {
      this.prevSibling.lexicalNode.insertBefore(this.lexicalNode);
      if (childContainer) {
        this.lexicalNode.insertAfter(childContainer);
      }
      cleanupEmptyList(parentListBefore, parentContainerBefore);
    }
    else {
      const parent = this.parent;
      parent.prevSibling?._appendChild(this);
      if (!parent.hasChildren) {
        parent._removeChildrenList();
      }
    }
  }

  focus() {
    $getEditor().dispatchCommand(NOTES_FOCUS_COMMAND, { key: this.lexicalKey });
  }

  get folded() {
    return !this.isRoot && $isNoteFolded(this.lexicalNode);
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
      $setNoteFolded(this.lexicalNode, value && this.hasChildren);
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
    return this.isRoot ? undefined : !!$getNoteChecked(this.lexicalNode);
  }

  set checked(value) {
    if (this.isRoot) {
      return;
    }
    this._walk((note) => {
      $setNoteChecked(note.lexicalNode, value ? true : undefined);
    });
  }

  toggleChecked() {
    if (this.isRoot) {
      return;
    }
    const checked = !this.checked;
    this._walk((note) => {
      $setNoteChecked(note.lexicalNode, checked ? true : undefined);
    });
  }

  get prevSibling() {
    const sibling = getPreviousNoteListItem(this.lexicalNode.getPreviousSibling());
    return $isListItemNode(sibling) ? Note.from(sibling) : null;
  }

  get nextSibling() {
    const sibling = getNextNoteListItem(this.lexicalNode.getNextSibling());
    return $isListItemNode(sibling) ? Note.from(sibling) : null;
  }

  get id() {
    return this.isRoot ? "root" : $getNoteID(this.lexicalNode);
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

function isContainerListItem(node: LexicalListItemNode | null | undefined): boolean {
  if (!$isListItemNode(node)) {
    return false;
  }
  if (!isNestedListNode(node)) {
    return false;
  }
  return node.getChildren().every($isListNode);
}

function getChildrenContainer(node: LexicalListItemNode) {
  const sibling = node.getNextSibling();
  if (isContainerListItem(sibling)) {
    return sibling;
  }
  return null;
}

function getPreviousNoteListItem(node: LexicalListItemNode | null | undefined) {
  let current = node;
  while (isContainerListItem(current)) {
    current = current.getPreviousSibling();
  }
  return current ?? null;
}

function getNextNoteListItem(node: LexicalListItemNode | null | undefined) {
  let current = node;
  while (isContainerListItem(current)) {
    current = current.getNextSibling();
  }
  return current ?? null;
}

function cleanupEmptyList(list: ListNode | null | undefined, container: LexicalListItemNode | null | undefined) {
  if (!$isListNode(list)) {
    return;
  }
  if (list.getChildrenSize() > 0) {
    return;
  }
  list.remove();
  if ($isListItemNode(container) && container.getChildrenSize() === 0) {
    container.remove();
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
