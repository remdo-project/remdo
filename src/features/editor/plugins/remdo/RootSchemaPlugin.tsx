import { useEffect } from "react";
import { RootNode } from "lexical";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";

import { useRemdoLexicalComposerContext } from "@/features/editor/plugins/remdo/ComposerContext";
import { useDocumentSelector as useDocumentSession } from "@/features/editor/DocumentSelector/DocumentSessionProvider";
import { mergeLists } from "./utils/unexported";

function $ensureSingleListRoot(rootNode: RootNode): void {
  const children = rootNode.getChildren();
  if (children.length === 1 && $isListNode(children[0])) {
    return;
  }

  let listNode = children.find($isListNode);
  let createdListNode = false;

  if (!listNode) {
    listNode = $createListNode("bullet");
    rootNode.append(listNode);
    createdListNode = true;
  }

  for (const child of children) {
    if (child === listNode) {
      continue;
    }

    if ($isListNode(child)) {
      mergeLists(listNode, child);
      continue;
    }

    if ($isListItemNode(child)) {
      listNode.append(child);
      continue;
    }

    const listItemNode = $createListItemNode();
    listItemNode.append(child);
    listNode.append(listItemNode);
  }

  if (createdListNode && listNode.getChildren().length === 0) {
    const listItemNode = $createListItemNode();
    listNode.append(listItemNode);
    listItemNode.select();
  }

  for (const child of rootNode.getChildren()) {
    if (child !== listNode) {
      child.remove();
    }
  }
}

export function RootSchemaPlugin(): null {
  const [editor] = useRemdoLexicalComposerContext();
  const { collabDisabled, ready } = useDocumentSession();
  const serializationFile = import.meta.env.VITEST_SERIALIZATION_FILE;
  const disableForSerialization = Boolean(serializationFile);
  const disableFix = !collabDisabled && !ready;

  useEffect(() => {
    if (disableForSerialization) {
      return;
    }

    if (disableFix) {
      return;
    }

    return editor.registerNodeTransform(RootNode, $ensureSingleListRoot);
  }, [disableFix, disableForSerialization, editor]);

  return null;
}
