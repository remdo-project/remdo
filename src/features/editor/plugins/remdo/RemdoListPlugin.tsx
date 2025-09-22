import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import {
  $getListDepth,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
  registerList,
} from "@lexical/list";
import { $findMatchingParent } from "@lexical/utils";
import type { LexicalEditor } from "lexical";

function registerRemdoStrictIndentTransform(editor: LexicalEditor) {
  const $formatListIndentStrict = (listItemNode: ListItemNode) => {
    const listNode = listItemNode.getParent();
    if ($isListNode(listItemNode.getFirstChild()) || !$isListNode(listNode)) {
      return;
    }

    const startingListItemNode = $findMatchingParent(
      listItemNode,
      (node) =>
        $isListItemNode(node) &&
        $isListNode(node.getParent()) &&
        $isListItemNode(node.getPreviousSibling()),
    );

    if ($isListItemNode(startingListItemNode)) {
      const prevListItemNode = startingListItemNode.getPreviousSibling();
      if ($isListItemNode(prevListItemNode)) {
        const endListItemNode = findChildrenEndListItemNode(prevListItemNode);
        const endListNode = endListItemNode.getParent();
        if ($isListNode(endListNode)) {
          const prevDepth = $getListDepth(endListNode);
          const depth = $getListDepth(listNode);
          if (prevDepth + 1 < depth) {
            listItemNode.setIndent(prevDepth);
          }
        }
      }
    }
  };

  const $processListWithStrictIndent = (listNode: ListNode) => {
    const queue = [listNode];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!$isListNode(node)) {
        continue;
      }

      for (const child of node.getChildren()) {
        if ($isListItemNode(child)) {
          $formatListIndentStrict(child);
          const firstChild = child.getFirstChild();
          if ($isListNode(firstChild)) {
            queue.push(firstChild);
          }
        }
      }
    }
  };

  return editor.registerNodeTransform(ListNode, $processListWithStrictIndent);
}

function findChildrenEndListItemNode(listItemNode: ListItemNode): ListItemNode {
  let current = listItemNode;
  let firstChild = current.getFirstChild();

  while ($isListNode(firstChild)) {
    const lastChild = firstChild.getLastChild();
    if ($isListItemNode(lastChild)) {
      current = lastChild;
      firstChild = current.getFirstChild();
    } else {
      break;
    }
  }

  return current;
}

export function RemdoListPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ListNode, ListItemNode])) {
      throw new Error(
        "ListPlugin: ListNode and/or ListItemNode not registered on editor",
      );
    }
  }, [editor]);

  useEffect(() => registerRemdoStrictIndentTransform(editor), [editor]);

  useEffect(() => registerList(editor), [editor]);

  return null;
}

