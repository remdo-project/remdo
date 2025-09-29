import { useEffect, useState } from "react";
import { RootNode } from "lexical";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";

import { useRemdoLexicalComposerContext } from "@/features/editor/plugins/remdo/ComposerContext";
import { useDisableCollaboration } from "@/features/editor/config";
import { useDocumentSelector } from "@/features/editor/DocumentSelector/DocumentSelector";
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
  //FIXME review and simplify once collab is refactored
  const disableCollaboration = useDisableCollaboration();
  const { yjsProvider } = useDocumentSelector();
  const [hasSynced, setHasSynced] = useState(
    () => disableCollaboration || Boolean(yjsProvider?.synced)
  );

  useEffect(() => {
    setHasSynced(disableCollaboration || Boolean(yjsProvider?.synced));
  }, [disableCollaboration, yjsProvider]);

  useEffect(() => {
    if (disableCollaboration || !yjsProvider) {
      return;
    }

    const handleSynced = (synced: boolean) => {
      setHasSynced(synced);
    };

    // y-websocket emits a "synced" event that toggles between true/false as the
    // provider handshake completes or disconnects. It's missing from the type
    // definitions.
    // @ts-expect-error The "synced" event is not declared in the typings.
    yjsProvider.on("synced", handleSynced);

    return () => {
      // @ts-expect-error The "synced" event is not declared in the typings.
      yjsProvider.off("synced", handleSynced);
    };
  }, [disableCollaboration, yjsProvider]);

  useEffect(() => {
    if (!disableCollaboration && !hasSynced) {
      return;
    }

    return editor.registerNodeTransform(RootNode, $ensureSingleListRoot);
  }, [disableCollaboration, editor, hasSynced]);

  return null;
}
