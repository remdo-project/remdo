import type { ListItemNode } from '@lexical/list';
import { $isListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getSelection, $isRangeSelection, $isTextNode } from 'lexical';
import type { LexicalNode, RangeSelection, TextNode } from 'lexical';
import { useEffect } from 'react';

const SNAP_SELECTION_TAG = 'selection:snap-range';

interface SnapPayload {
  anchorKey: string;
  focusKey: string;
  anchorEdge: 'start' | 'end';
  focusEdge: 'start' | 'end';
}

export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      if (tags.has(SNAP_SELECTION_TAG)) {
        return;
      }

      let payload: SnapPayload | null = null;

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          return;
        }

        const noteItems = collectSelectedListItems(selection);
        if (noteItems.length < 2) {
          return;
        }

        const candidate = createSnapPayload(selection, noteItems);
        if (!candidate) {
          return;
        }

        if (selectionMatchesPayload(selection, candidate)) {
          return;
        }

        payload = candidate;
      });

      if (!payload) {
        return;
      }

      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          const anchorItem = $getNodeByKey<ListItemNode>(payload!.anchorKey);
          const focusItem = $getNodeByKey<ListItemNode>(payload!.focusKey);
          if (!anchorItem || !focusItem) {
            return;
          }

          const anchorPoint = resolveBoundaryPoint(anchorItem, payload!.anchorEdge);
          const focusPoint = resolveBoundaryPoint(focusItem, payload!.focusEdge);
          if (!anchorPoint || !focusPoint) {
            return;
          }

          selection.setTextNodeRange(anchorPoint.node, anchorPoint.offset, focusPoint.node, focusPoint.offset);
        },
        { tag: SNAP_SELECTION_TAG }
      );
    });
  }, [editor]);

  return null;
}

function collectSelectedListItems(selection: RangeSelection): ListItemNode[] {
  const seen = new Set<string>();
  const items: ListItemNode[] = [];

  for (const node of selection.getNodes()) {
    const listItem = findNearestListItem(node);
    if (!listItem) {
      continue;
    }

    const key = listItem.getKey();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(listItem);
  }

  if (items.length === 0) {
    return items;
  }

  return items.sort(compareDocumentOrder);
}

function selectionMatchesPayload(selection: RangeSelection, payload: SnapPayload): boolean {
  const anchorItem = findNearestListItem(selection.anchor.getNode());
  const focusItem = findNearestListItem(selection.focus.getNode());
  if (!anchorItem || !focusItem) {
    return false;
  }

  if (anchorItem.getKey() !== payload.anchorKey || focusItem.getKey() !== payload.focusKey) {
    return false;
  }

  return (
    pointMatchesEdge(selection.anchor, payload.anchorEdge, anchorItem) &&
    pointMatchesEdge(selection.focus, payload.focusEdge, focusItem)
  );
}

function pointMatchesEdge(
  point: RangeSelection['anchor'],
  edge: 'start' | 'end',
  listItem: ListItemNode
): boolean {
  const boundary = resolveBoundaryPoint(listItem, edge);
  if (!boundary) {
    return false;
  }

  const node = point.getNode();
  if (!$isTextNode(node)) {
    return false;
  }

  return node.getKey() === boundary.node.getKey() && point.offset === boundary.offset;
}

function createSnapPayload(selection: RangeSelection, items: ListItemNode[]): SnapPayload | null {
  if (items.length === 0) {
    return null;
  }

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const isBackward = selection.isBackward();

  return {
    anchorKey: isBackward ? last.getKey() : first.getKey(),
    focusKey: isBackward ? first.getKey() : last.getKey(),
    anchorEdge: isBackward ? 'end' : 'start',
    focusEdge: isBackward ? 'start' : 'end',
  } satisfies SnapPayload;
}

function resolveBoundaryPoint(listItem: ListItemNode, edge: 'start' | 'end') {
  const textNode = findBoundaryTextNode(listItem, edge);
  if (!textNode) {
    return null;
  }

  const length = textNode.getTextContentSize?.() ?? textNode.getTextContent().length;
  const offset = edge === 'start' ? 0 : length;
  return { node: textNode, offset } as const;
}

function findBoundaryTextNode(node: LexicalNode, edge: 'start' | 'end'): TextNode | null {
  if ($isTextNode(node)) {
    return node;
  }

  const canTraverse = typeof (node as any).getChildren === 'function';
  if (!canTraverse) {
    return null;
  }

  const children = (node as any).getChildren?.() ?? [];
  const ordered = edge === 'start' ? children : [...children].reverse();

  for (const child of ordered) {
    const match = findBoundaryTextNode(child, edge);
    if (match) {
      return match;
    }
  }

  return null;
}

function findNearestListItem(node: LexicalNode | null): ListItemNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function compareDocumentOrder(a: ListItemNode, b: ListItemNode): number {
  const aPath = getNodePath(a);
  const bPath = getNodePath(b);
  const depth = Math.max(aPath.length, bPath.length);

  for (let i = 0; i < depth; i += 1) {
    const left = aPath[i] ?? -1;
    const right = bPath[i] ?? -1;
    if (left !== right) {
      return left - right;
    }
  }

  return 0;
}

function getNodePath(node: ListItemNode): number[] {
  const path: number[] = [];
  let current: LexicalNode | null = node;

  while (current) {
    const parent: LexicalNode | null = current.getParent();
    if (!parent) {
      break;
    }
    const index = current.getIndexWithinParent();
    path.push(index);
    current = parent;
  }

  return path.reverse();
}
