import {
  ListItemNode,
  ListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";
import {
  $isRootOrShadowRoot,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import {
  $getNoteChecked,
  $getNoteID,
  $isNoteFolded,
  getListItemOwnText,
} from "./noteState";
import { getRemdoState } from "./remdoState";

function clearEmptyClass(element: Element) {
  if (element.hasAttribute("class") && element.classList.length === 0) {
    element.removeAttribute("class");
  }
}

function hasNestedList(node: ListItemNode): boolean {
  return node.getChildren().some((child) => $isListNode(child));
}

export function syncListItemElement(editor: LexicalEditor, node: ListItemNode) {
  const element = editor.getElementByKey(node.getKey());
  if (!element) {
    return;
  }

  const state = getRemdoState(editor);

  const id = $getNoteID(node);
  if (id) {
    element.dataset.noteId = id;
  }

  const folded = $isNoteFolded(node) && hasNestedList(node);
  element.classList.toggle("note-folded", folded);

  const checked = $getNoteChecked(node);
  element.classList.toggle("li-checked", !!checked);

  element.classList.remove("note-hovered");

  const filter = state?.getFilter?.();
  const focusNode = state?.getFocus?.();
  element.classList.remove("filtered", "unfiltered");

  if (filter) {
    const ownText = getListItemOwnText(node);
    const matches = ownText.includes(filter);
    element.classList.add(matches ? "unfiltered" : "filtered");
  } else if (focusNode) {
    const focusMatches =
      focusNode.getKey() === node.getKey() ||
      focusNode.getParent()?.getKey() === node.getKey() ||
      focusNode.isParentOf(node);
    element.classList.add(focusMatches ? "unfiltered" : "filtered");
  }

  clearEmptyClass(element);
}

export function syncListElement(editor: LexicalEditor, node: ListNode) {
  const element = editor.getElementByKey(node.getKey());
  if (!element) {
    return;
  }

  const state = getRemdoState(editor);
  const filter = state?.getFilter?.();
  const focusNode = state?.getFocus?.();

  element.classList.remove("list-unstyled", "filtered", "unfiltered");

  if (filter && !$isRootOrShadowRoot(node.getParent())) {
    element.classList.add("list-unstyled");
  }

  if (focusNode && !filter) {
    const focusMatches =
      focusNode.getParent()?.getKey() === node.getKey() ||
      focusNode.isParentOf(node);
    element.classList.add(focusMatches ? "unfiltered" : "filtered");
  }

  clearEmptyClass(element);
}

export function syncAllListMetadata(editor: LexicalEditor) {
  const editorState = editor.getEditorState();
  editorState.read(() => {
    const nodeMap = (editorState as unknown as {
      _nodeMap: Map<string, LexicalNode>;
    })._nodeMap;

    nodeMap.forEach((node) => {
      if ($isListItemNode(node)) {
        syncListItemElement(editor, node);
      } else if ($isListNode(node)) {
        syncListElement(editor, node as ListNode);
      }
    });
  });
}
