/**
 * Minimal helpers copied from Lexical's list utilities.
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Licensed under the MIT license.
 */

import { $findMatchingParent } from "@lexical/utils";
import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import type { LexicalNode } from "lexical";

export function isNestedListNode(
  node: LexicalNode | null | undefined,
): node is ListItemNode {
  return $isListItemNode(node) && $isListNode(node.getFirstChild());
}

export function $findNearestListItemNode(
  node: LexicalNode,
): ListItemNode | null {
  return $findMatchingParent(node, (parent) => $isListItemNode(parent)) as
    | ListItemNode
    | null;
}

export function mergeLists(list1: ListNode, list2: ListNode): void {
  const listItem1 = list1.getLastChild();
  const listItem2 = list2.getFirstChild();

  if (listItem1 && listItem2) {
    const child1 = listItem1.getFirstChild();
    const child2 = listItem2.getFirstChild();
    if ($isListNode(child1) && $isListNode(child2)) {
      mergeLists(child1, child2);
      listItem2.remove();
    }
  }

  const toMerge = list2.getChildren();
  if (toMerge.length > 0) {
    list1.append(...toMerge);
  }

  list2.remove();
}
