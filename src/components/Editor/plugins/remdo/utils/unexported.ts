//unexported, but useful items from lexical

import { $isListItemNode, $isListNode, ListItemNode, ListNode } from "@lexical/list";
import { $getNearestNodeFromDOMNode, $isDecoratorNode, LexicalNode, Spread } from "lexical";
import { $findMatchingParent} from "@lexical/utils";

// Reconciling
export const NO_DIRTY_NODES = 0;
export const HAS_DIRTY_NODES = 1;
export const FULL_RECONCILE = 2;

const NestedListNodeBrand: unique symbol = Symbol.for(
  '@lexical/NestedListNodeBrand',
);

/**
 * Checks to see if the passed node is a ListItemNode and has a ListNode as a child.
 * @param node - The node to be checked.
 * @returns true if the node is a ListItemNode and has a ListNode child, false otherwise.
 */
export function isNestedListNode(
  node: LexicalNode | null | undefined,
): node is Spread<
  {getFirstChild(): ListNode; [NestedListNodeBrand]: never},
  ListItemNode
> {
  return $isListItemNode(node) && $isListNode(node.getFirstChild());
}

/**
 * A recursive function that goes through each list and their children, including nested lists,
 * appending list2 children after list1 children and updating ListItemNode values.
 * @param list1 - The first list to be merged.
 * @param list2 - The second list to be merged.
 */
export function mergeLists(list1: ListNode, list2: ListNode): void {
  const listItem1 = list1.getLastChild();
  const listItem2 = list2.getFirstChild();

  if (
    listItem1 &&
    listItem2 &&
    isNestedListNode(listItem1) &&
    isNestedListNode(listItem2)
  ) {
    mergeLists(listItem1.getFirstChild(), listItem2.getFirstChild());
    listItem2.remove();
  }

  const toMerge = list2.getChildren();
  if (toMerge.length > 0) {
    list1.append(...toMerge);
  }

  list2.remove();
}

export function getElementByKeyOrThrow(
  editor: LexicalEditor,
  key: NodeKey,
): HTMLElement {
  const element = editor._keyToDOMMap.get(key);

  if (element === undefined) {
    invariant(
      false,
      'Reconciliation: could not find DOM element for node key %s',
      key,
    );
  }

  return element;
}

export function $findNearestListItemNode(
  node: LexicalNode,
): ListItemNode | null {
  const matchingParent = $findMatchingParent(node, (parent) =>
    $isListItemNode(parent),
  );
  return matchingParent as ListItemNode | null;
}

//copied, unexported function from lexical/packages/lexical-rich-text/src/index.ts
export function $isTargetWithinDecorator(target: HTMLElement): boolean {
  const node = $getNearestNodeFromDOMNode(target);
  return $isDecoratorNode(node);
}

