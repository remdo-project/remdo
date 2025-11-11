import type { ListItemNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  SELECT_ALL_COMMAND,
} from 'lexical';
import type { LexicalNode, RangeSelection, TextNode } from 'lexical';
import { useEffect, useRef } from 'react';

const SNAP_SELECTION_TAG = 'selection:snap-range';
const PROGRESSIVE_SELECTION_TAG = 'selection:progressive-range';

interface SnapPayload {
  anchorKey: string;
  focusKey: string;
  anchorEdge: 'start' | 'end';
  focusEdge: 'start' | 'end';
}

interface ProgressiveSelectionState {
  anchorKey: string | null;
  stage: number;
  locked: boolean;
}

const INITIAL_PROGRESSIVE_STATE: ProgressiveSelectionState = {
  anchorKey: null,
  stage: 0,
  locked: false,
};

type BoundaryMode = 'content' | 'subtree';

type ProgressivePlan =
  | {
      type: 'inline';
      itemKey: string;
    }
  | {
      type: 'range';
      startKey: string;
      endKey: string;
      startMode: BoundaryMode;
      endMode: BoundaryMode;
    };

interface ProgressivePlanResult {
  anchorKey: string;
  stage: number;
  plan: ProgressivePlan;
}

export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const progressionRef = useRef<ProgressiveSelectionState>(INITIAL_PROGRESSIVE_STATE);

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState, tags }) => {
      const isProgressiveUpdate = tags.has(PROGRESSIVE_SELECTION_TAG);
      if (isProgressiveUpdate) {
        progressionRef.current = { ...progressionRef.current, locked: true };
      } else if (progressionRef.current.locked) {
        progressionRef.current = { ...progressionRef.current, locked: false };
      } else {
        progressionRef.current = INITIAL_PROGRESSIVE_STATE;
      }

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

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event) => {
        let planResult: ProgressivePlanResult | null = null;
        editor.getEditorState().read(() => {
          planResult = $computeProgressivePlan(progressionRef);
        });

        if (!planResult) {
          return false;
        }

        event?.preventDefault();

        editor.update(
          () => {
            $applyProgressivePlan(planResult!);
            progressionRef.current = {
              anchorKey: planResult!.anchorKey,
              stage: planResult!.stage,
              locked: true,
            };
          },
          { tag: [SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG] }
        );

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      unregisterUpdate();
      unregisterSelectAll();
    };
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

function $computeProgressivePlan(
  progressionRef: React.MutableRefObject<ProgressiveSelectionState>
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  const anchorItem = findNearestListItem(selection.anchor.getNode());
  if (!anchorItem) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  const anchorContent = getContentListItem(anchorItem);
  const anchorKey = anchorContent.getKey();
  const nextStage =
    progressionRef.current.anchorKey === anchorKey ? progressionRef.current.stage + 1 : 1;

  const planEntry = $buildPlanForStage(anchorContent, nextStage);
  if (!planEntry) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  return {
    anchorKey,
    stage: planEntry.stage,
    plan: planEntry.plan,
  };
}

function $buildPlanForStage(
  anchorContent: ListItemNode,
  stage: number
): { plan: ProgressivePlan; stage: number } | null {
  if (stage <= 1) {
    const inlinePlan = $createInlinePlan(anchorContent);
    if (inlinePlan) {
      return { plan: inlinePlan, stage: 1 };
    }
    const notePlan = $createNoteBodyPlan(anchorContent);
    return notePlan ? { plan: notePlan, stage: 2 } : null;
  }

  if (stage === 2) {
    const notePlan = $createNoteBodyPlan(anchorContent);
    return notePlan ? { plan: notePlan, stage: 2 } : null;
  }

  const offset = stage - 3;
  const levelsUp = Math.floor(offset / 2);
  const includeSiblings = offset % 2 === 1;

  const targetContent = ascendContentItem(anchorContent, levelsUp);
  if (!targetContent) {
    const docPlan = $createDocumentPlan();
    return docPlan ? { plan: docPlan, stage } : null;
  }

  if (includeSiblings) {
    const siblingPlan = $createSiblingRangePlan(targetContent);
    return siblingPlan ? { plan: siblingPlan, stage } : null;
  }

  const subtreePlan = $createSubtreePlan(targetContent);
  return subtreePlan ? { plan: subtreePlan, stage } : null;
}

function $createInlinePlan(item: ListItemNode): ProgressivePlan | null {
  return $hasInlineBoundary(item) ? { type: 'inline', itemKey: item.getKey() } : null;
}

function $createNoteBodyPlan(item: ListItemNode): ProgressivePlan | null {
  return {
    type: 'range',
    startKey: item.getKey(),
    endKey: item.getKey(),
    startMode: 'content',
    endMode: 'content',
  };
}

function $createSubtreePlan(item: ListItemNode): ProgressivePlan | null {
  const tail = getSubtreeTail(item);
  return {
    type: 'range',
    startKey: item.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };
}

function $createSiblingRangePlan(item: ListItemNode): ProgressivePlan | null {
  const siblings = getContentSiblings(item);
  if (siblings.length === 0) {
    return null;
  }

  const lastSibling = siblings[siblings.length - 1]!;
  const tail = getSubtreeTail(lastSibling);
  return {
    type: 'range',
    startKey: siblings[0]!.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };
}

function $createDocumentPlan(): ProgressivePlan | null {
  const root = $getRoot();
  const list = root.getFirstChild();
  if (!$isListNode(list)) {
    return null;
  }

  const contentItems = list
    .getChildren()
    .filter((node): node is ListItemNode => $isListItemNode(node) && !isChildrenWrapper(node));
  if (contentItems.length === 0) {
    return null;
  }

  const last = contentItems[contentItems.length - 1]!;
  const tail = getSubtreeTail(last);
  return {
    type: 'range',
    startKey: contentItems[0]!.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };
}

function $hasInlineBoundary(item: ListItemNode): boolean {
  return Boolean(resolveContentBoundaryPoint(item, 'start') && resolveContentBoundaryPoint(item, 'end'));
}

function $applyProgressivePlan(result: ProgressivePlanResult) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }

  if (result.plan.type === 'inline') {
    const item = $getNodeByKey<ListItemNode>(result.plan.itemKey);
    if (!item) {
      return;
    }
    if (!selectInlineContent(selection, item)) {
      selectNoteBody(selection, item);
    }
    return;
  }

  const startItem = $getNodeByKey<ListItemNode>(result.plan.startKey);
  const endItem = $getNodeByKey<ListItemNode>(result.plan.endKey);
  if (!startItem || !endItem) {
    return;
  }

  setSelectionBetweenItems(selection, startItem, endItem, result.plan.startMode, result.plan.endMode);
}

function selectInlineContent(selection: RangeSelection, item: ListItemNode): boolean {
  const start = resolveContentBoundaryPoint(item, 'start');
  const end = resolveContentBoundaryPoint(item, 'end') ?? start;
  if (!start || !end) {
    return selectNoteBody(selection, item);
  }

  selection.setTextNodeRange(start.node, start.offset, end.node, end.offset);
  return true;
}

function selectNoteBody(selection: RangeSelection, item: ListItemNode): boolean {
  return setSelectionBetweenItems(selection, item, item, 'content', 'content');
}

function setSelectionBetweenItems(
  selection: RangeSelection,
  startItem: ListItemNode,
  endItem: ListItemNode,
  startMode: BoundaryMode,
  endMode: BoundaryMode
): boolean {
  const start =
    startMode === 'content'
      ? resolveContentBoundaryPoint(startItem, 'start')
      : resolveBoundaryPoint(startItem, 'start');
  const end =
    endMode === 'content'
      ? resolveContentBoundaryPoint(endItem, 'end')
      : resolveBoundaryPoint(endItem, 'end');

  if (!start || !end) {
    return false;
  }

  selection.setTextNodeRange(start.node, start.offset, end.node, end.offset);
  return true;
}

function resolveContentBoundaryPoint(listItem: ListItemNode, edge: 'start' | 'end') {
  const textNode = findContentBoundaryTextNode(listItem, edge);
  if (!textNode) {
    return null;
  }

  const length = textNode.getTextContentSize?.() ?? textNode.getTextContent().length;
  const offset = edge === 'start' ? 0 : length;
  return { node: textNode, offset } as const;
}

function findContentBoundaryTextNode(listItem: ListItemNode, edge: 'start' | 'end'): TextNode | null {
  const children = listItem.getChildren();
  const ordered = edge === 'start' ? children : [...children].reverse();

  for (const child of ordered) {
    if ($isListNode(child)) {
      continue;
    }

    const match = findBoundaryTextNode(child, edge);
    if (match) {
      return match;
    }
  }

  return null;
}

function getContentListItem(item: ListItemNode): ListItemNode {
  if (!isChildrenWrapper(item)) {
    return item;
  }

  const previous = item.getPreviousSibling();
  return $isListItemNode(previous) ? previous : item;
}

function ascendContentItem(item: ListItemNode, levels: number): ListItemNode | null {
  let current: ListItemNode | null = item;

  for (let i = 0; i < levels; i += 1) {
    current = getParentContentItem(current);
    if (!current) {
      return null;
    }
  }

  return current;
}

function getParentContentItem(item: ListItemNode): ListItemNode | null {
  const parentList = item.getParent();
  if (!$isListNode(parentList)) {
    return null;
  }

  const parentWrapper = parentList.getParent();
  if (!isChildrenWrapper(parentWrapper)) {
    return null;
  }

  const parentContent = parentWrapper.getPreviousSibling();
  return $isListItemNode(parentContent) ? parentContent : null;
}

function isChildrenWrapper(node: LexicalNode | null | undefined): node is ListItemNode {
  return (
    $isListItemNode(node) &&
    node.getChildren().length === 1 &&
    $isListNode(node.getFirstChild())
  );
}

function getWrapperForContent(item: ListItemNode): ListItemNode | null {
  const next = item.getNextSibling();
  return isChildrenWrapper(next) ? next : null;
}

function getSubtreeTail(item: ListItemNode): ListItemNode {
  const wrapper = getWrapperForContent(item);
  if (!wrapper) {
    return item;
  }

  const nestedList = wrapper.getFirstChild();
  if (!$isListNode(nestedList)) {
    return wrapper;
  }

  const children = nestedList.getChildren();
  if (children.length === 0) {
    return wrapper;
  }

  const lastChild = children[children.length - 1];
  if (!$isListItemNode(lastChild)) {
    return wrapper;
  }

  return getSubtreeTail(lastChild);
}

function getContentSiblings(item: ListItemNode): ListItemNode[] {
  const parentList = item.getParent();
  if (!$isListNode(parentList)) {
    return [item];
  }

  const siblings: ListItemNode[] = [];
  for (const child of parentList.getChildren()) {
    if ($isListItemNode(child) && !isChildrenWrapper(child)) {
      siblings.push(child);
    }
  }

  return siblings.length === 0 ? [item] : siblings;
}
