// RemDo-specific utilities and minimal shims around Lexical

import {
  isNestedListNode,
  $findNearestListItemNode,
  mergeLists,
} from "@/lexical-shims/list";
import { $getNearestNodeFromDOMNode, $isDecoratorNode, LexicalEditor, NodeKey } from "lexical";

// Reconciling flags (internal). Avoid relying on these if possible.
export const NO_DIRTY_NODES = 0;
export const HAS_DIRTY_NODES = 1;
export const FULL_RECONCILE = 2;

export { isNestedListNode, mergeLists, $findNearestListItemNode };

export function getElementByKeyOrThrow(
  editor: LexicalEditor,
  key: NodeKey,
): HTMLElement {
  const element = editor.getElementByKey(key);
  if (!element) {
    throw new Error(`Could not find DOM element for node key ${String(key)}`);
  }
  return element;
}

// Mirrors the tiny helper from lexical-rich-text; implemented via public APIs.
export function $isTargetWithinDecorator(target: HTMLElement): boolean {
  const node = $getNearestNodeFromDOMNode(target);
  return $isDecoratorNode(node);
}
