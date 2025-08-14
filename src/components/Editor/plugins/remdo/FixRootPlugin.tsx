import { useRemdoLexicalComposerContext } from "@/components/Editor/plugins/remdo/ComposerContext";
import {
  $getRoot,
  RootNode,
} from "lexical";
import { useEffect } from "react";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";
import { mergeLists } from "./utils/unexported";

/**
 *  forces the right editor structure:
 *  root
 *    ul
 *       ...
 */
function $fixRoot(rootNode: RootNode) {
  const children = $getRoot().getChildren();
  if (children.length === 1 && $isListNode(children[0])) {
    return;
  }
  let listNode = children.find($isListNode);
  if (!listNode) {
    listNode = $createListNode("bullet");
    rootNode.append(listNode);
    const listItemNode = $createListItemNode();
    listItemNode.append(...children);
    listNode.append(listItemNode);
    listItemNode.select();
    return;
  }
  for (const child of children) {
    if (child === listNode) {
      continue;
    }
    if ($isListNode(child)) {
      mergeLists(listNode, child);
    } else if ($isListItemNode(child)) {
      listNode.append(child);
    } else {
      const listItemNode = $createListItemNode();
      listItemNode.append(child);
      listNode.append(listItemNode);
    }
  }
}

export function FixRootPlugin() {
  const [editor] = useRemdoLexicalComposerContext();

  useEffect(() => {
    //TODO consider using https://lexical.dev/docs/react/plugins#lexicalonchangeplugin
    return editor.registerNodeTransform(RootNode, $fixRoot);
  }, [editor]);

  return null;
}
