import type { ListItemNode, ListNode } from '@lexical/list';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ESCAPE_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ENTER_COMMAND,
  SELECT_ALL_COMMAND,
  createCommand,
} from 'lexical';
import type { LexicalNode, RangeSelection, TextNode } from 'lexical';
import { useEffect, useRef } from 'react';

const PROGRESSIVE_SELECTION_TAG = 'selection:progressive-range';
const SNAP_SELECTION_TAG = 'selection:snap-range';

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

interface ProgressiveUnlockState {
  pending: boolean;
  reason: 'directional' | 'external';
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

function isNoopPlan(result: ProgressivePlanResult): boolean {
  if (result.stage !== 2) {
    return false;
  }

  if (result.plan.type !== 'range') {
    return false;
  }

  const { startKey, endKey, startMode, endMode } = result.plan;
  return (
    startKey === endKey &&
    startKey === result.anchorKey &&
    startMode === 'content' &&
    endMode === 'content'
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const PROGRESSIVE_SELECTION_DIRECTION_COMMAND = createCommand<{
  direction: 'up' | 'down';
}>('selection:progressive-direction');

export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const progressionRef = useRef<ProgressiveSelectionState>(INITIAL_PROGRESSIVE_STATE);
  const unlockRef = useRef<ProgressiveUnlockState>({ pending: false, reason: 'external' });
  const structuralSelectionRef = useRef(false);

  useEffect(() => {
    interface StructuralSelectionRange {
      startKey: string;
      endKey: string;
    }

    let pendingFocusFrame: number | null = null;
    let pendingFocusTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearStructuralSelectionMetrics = () => {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }
      rootElement.style.removeProperty('--structural-selection-top');
      rootElement.style.removeProperty('--structural-selection-height');
    };

    const scheduleFocusRestore = () => {
      if (typeof requestAnimationFrame === 'function') {
        if (pendingFocusFrame !== null) {
          cancelAnimationFrame(pendingFocusFrame);
        }
        pendingFocusFrame = requestAnimationFrame(() => {
          pendingFocusFrame = null;
          editor.focus();
        });
        return;
      }

      if (pendingFocusTimeout !== null) {
        clearTimeout(pendingFocusTimeout);
      }

      pendingFocusTimeout = setTimeout(() => {
        pendingFocusTimeout = null;
        editor.focus();
      }, 0);
    };

    const applyStructuralSelectionMetrics = (range: StructuralSelectionRange | null) => {
      if (!range) {
        clearStructuralSelectionMetrics();
        return;
      }

      const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }

      const startElement = editor.getElementByKey(range.startKey) as HTMLElement | null;
      const endElement = editor.getElementByKey(range.endKey) as HTMLElement | null;
      if (!startElement || !endElement) {
        clearStructuralSelectionMetrics();
        return;
      }

      const rootRect = rootElement.getBoundingClientRect();
      const startRect = startElement.getBoundingClientRect();
      const endRect = endElement.getBoundingClientRect();
      const scrollTop = rootElement.scrollTop;
      const top = startRect.top - rootRect.top + scrollTop;
      const bottom = endRect.bottom - rootRect.top + scrollTop;
      const height = Math.max(0, bottom - top);

      rootElement.style.setProperty('--structural-selection-top', `${top}px`);
      rootElement.style.setProperty('--structural-selection-height', `${height}px`);
    };

    const applyStructuralSelectionAttribute = () => {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }

      if (structuralSelectionRef.current) {
        rootElement.dataset.structuralSelection = 'true';
      } else {
        delete rootElement.dataset.structuralSelection;
      }
    };

    const setStructuralSelectionActive = (isActive: boolean) => {
      if (structuralSelectionRef.current === isActive) {
        return;
      }

      structuralSelectionRef.current = isActive;
      applyStructuralSelectionAttribute();
    };

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      if (previousRootElement) {
        delete previousRootElement.dataset.structuralSelection;
      }

      if (!rootElement) {
        return;
      }

      if (structuralSelectionRef.current) {
        rootElement.dataset.structuralSelection = 'true';
      }
    });

    const unregisterProgressionListener = editor.registerUpdateListener(({ editorState, tags }) => {
      let hasStructuralSelection = false;
      let structuralRange: StructuralSelectionRange | null = null;

      const payload = editorState.read(() => {
        const selection = $getSelection();

        if (tags.has(PROGRESSIVE_SELECTION_TAG)) {
          const isLocked = $isRangeSelection(selection) && !selection.isCollapsed();
          progressionRef.current = { ...progressionRef.current, locked: isLocked };
          unlockRef.current.pending = false;
        } else if ($isRangeSelection(selection)) {
          const anchorItem = findNearestListItem(selection.anchor.getNode());
          const anchorKey = anchorItem ? getContentListItem(anchorItem).getKey() : null;
          if (!anchorKey || selection.isCollapsed() || progressionRef.current.anchorKey !== anchorKey) {
            if (!unlockRef.current.pending || unlockRef.current.reason !== 'directional') {
              progressionRef.current = INITIAL_PROGRESSIVE_STATE;
            }
            unlockRef.current = { pending: false, reason: 'external' };
          }
        } else {
          progressionRef.current = INITIAL_PROGRESSIVE_STATE;
          unlockRef.current = { pending: false, reason: 'external' };
        }

        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          hasStructuralSelection = false;
          return null;
        }

        const noteItems = collectSelectedListItems(selection);
        if (noteItems.length > 0) {
          const orderedItems = noteItems.map((item) => getContentListItem(item));
          structuralRange = {
            startKey: orderedItems[0]!.getKey(),
            endKey: orderedItems[orderedItems.length - 1]!.getKey(),
          };
        }

        const hasMultiNoteRange = noteItems.length > 1;
        const isProgressiveStructural = progressionRef.current.locked && progressionRef.current.stage >= 2;
        hasStructuralSelection = isProgressiveStructural || hasMultiNoteRange;
        if (tags.has(SNAP_SELECTION_TAG) || noteItems.length < 2) {
          return null;
        }

        const candidate = createSnapPayload(selection, noteItems);
        if (!candidate || selectionMatchesPayload(selection, candidate)) {
          return null;
        }

        return candidate;
      });

      if (hasStructuralSelection && structuralRange) {
        applyStructuralSelectionMetrics(structuralRange);
      } else {
        clearStructuralSelectionMetrics();
      }

      setStructuralSelectionActive(hasStructuralSelection && structuralRange !== null);

      if (!payload) {
        return;
      }

      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          const anchorItem = $getNodeByKey<ListItemNode>(payload.anchorKey);
          const focusItem = $getNodeByKey<ListItemNode>(payload.focusKey);
          if (!anchorItem || !focusItem) {
            return;
          }

          const anchorPoint = resolveBoundaryPoint(anchorItem, payload.anchorEdge);
          const focusPoint = resolveBoundaryPoint(focusItem, payload.focusEdge);
          if (!anchorPoint || !focusPoint) {
            return;
          }

          selection.setTextNodeRange(anchorPoint.node, anchorPoint.offset, focusPoint.node, focusPoint.offset);
        },
        { tag: SNAP_SELECTION_TAG }
      );
    });

    const applyPlan = (planResult: ProgressivePlanResult) => {
      editor.update(
        () => {
          const applied = $applyProgressivePlan(planResult);
          if (!applied) {
            progressionRef.current = INITIAL_PROGRESSIVE_STATE;
            return;
          }

          progressionRef.current = {
            anchorKey: planResult.anchorKey,
            stage: planResult.stage,
            locked: true,
          };
        },
        { tag: [SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG] }
      );
    };

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event) => {
        const planResult = editor.getEditorState().read(() =>
          $computeProgressivePlan(progressionRef)
        );

        if (!planResult) {
          return false;
        }

        event.preventDefault();

        applyPlan(planResult);

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterArrowLeft = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event) => {
        if (!event.shiftKey) {
          return false;
        }

        const shouldBlock = editor.getEditorState().read(() =>
          $shouldBlockHorizontalArrow('left')
        );

        if (!shouldBlock) {
          return false;
        }

        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterArrowRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => {
        if (!event.shiftKey) {
          return false;
        }

        const shouldBlock = editor.getEditorState().read(() =>
          $shouldBlockHorizontalArrow('right')
        );

        if (!shouldBlock) {
          return false;
        }

        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const runDirectionalPlan = (direction: 'up' | 'down') => {
      unlockRef.current = { pending: true, reason: 'directional' };

      editor.update(
        () => {
          const planResult = $computeDirectionalPlan(progressionRef, direction);
          if (!planResult) {
            progressionRef.current = INITIAL_PROGRESSIVE_STATE;
            return;
          }

          const noopPlan = isNoopPlan(planResult);
          const applied = noopPlan || $applyProgressivePlan(planResult);
          if (!applied) {
            progressionRef.current = INITIAL_PROGRESSIVE_STATE;
            return;
          }

          progressionRef.current = {
            anchorKey: planResult.anchorKey,
            stage: planResult.stage,
            locked: true,
          };
        },
        { tag: [SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG] }
      );
    };

    const unregisterDirectionalCommand = editor.registerCommand(
      PROGRESSIVE_SELECTION_DIRECTION_COMMAND,
      ({ direction }) => {
        runDirectionalPlan(direction);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        let handled = false;

        editor.update(
          () => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || selection.isCollapsed()) {
              return;
            }

            handled = collapseSelectionToCaret(selection);
            if (!handled) {
              return;
            }

            progressionRef.current = INITIAL_PROGRESSIVE_STATE;
            unlockRef.current = { pending: false, reason: 'external' };
          },
          { tag: PROGRESSIVE_SELECTION_TAG }
        );

        if (!handled) {
          return false;
        }

        event?.preventDefault();
        event?.stopPropagation();
        setStructuralSelectionActive(false);
        clearStructuralSelectionMetrics();
        scheduleFocusRestore();

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!structuralSelectionRef.current) {
          return false;
        }

        event?.preventDefault();
        event?.stopPropagation();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      structuralSelectionRef.current = false;
      const rootElement = editor.getRootElement();
      if (rootElement) {
        delete rootElement.dataset.structuralSelection;
      }
      clearStructuralSelectionMetrics();
      if (pendingFocusFrame !== null) {
        cancelAnimationFrame(pendingFocusFrame);
        pendingFocusFrame = null;
      }
      if (pendingFocusTimeout !== null) {
        clearTimeout(pendingFocusTimeout);
        pendingFocusTimeout = null;
      }

      unregisterProgressionListener();
      unregisterSelectAll();
      unregisterArrowLeft();
      unregisterArrowRight();
      unregisterDirectionalCommand();
      unregisterEnter();
      unregisterEscape();
      unregisterRootListener();
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

  return items.toSorted(compareDocumentOrder);
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

function $shouldBlockHorizontalArrow(direction: 'left' | 'right'): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const noteItems = collectSelectedListItems(selection);
  if (noteItems.length === 0) {
    return false;
  }

  if (noteItems.length > 1) {
    return true;
  }

  const contentItem = getContentListItem(noteItems[0]!);
  const focus = selection.focus;
  const boundary = resolveContentBoundaryPoint(contentItem, direction === 'left' ? 'start' : 'end');

  if (!boundary) {
    return true;
  }

  const node = focus.getNode();
  if (!$isTextNode(node)) {
    return true;
  }

  return node.getKey() === boundary.node.getKey() && focus.offset === boundary.offset;
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
  const last = items.at(-1)!;
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

  const length = textNode.getTextContentSize();
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

  const children = ((node as any).getChildren?.() ?? []) as LexicalNode[];
  const ordered = edge === 'start' ? children : children.toReversed();

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
  let child: LexicalNode = node;
  let parent: LexicalNode | null = node.getParent();

  while (parent) {
    path.push(child.getIndexWithinParent());
    child = parent;
    parent = child.getParent();
  }

  return path.toReversed();
}

function $computeProgressivePlan(
  progressionRef: React.MutableRefObject<ProgressiveSelectionState>
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  if (selection.isCollapsed() && progressionRef.current.locked) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
  }

  let anchorContent: ListItemNode | null = null;
  if (progressionRef.current.anchorKey) {
    const storedAnchor = $getNodeByKey<ListItemNode>(progressionRef.current.anchorKey);
    if (storedAnchor) {
      anchorContent = getContentListItem(storedAnchor);
    }
  }

  if (!anchorContent) {
    const anchorItem = findNearestListItem(selection.anchor.getNode());
    if (!anchorItem) {
      progressionRef.current = INITIAL_PROGRESSIVE_STATE;
      return null;
    }
    anchorContent = getContentListItem(anchorItem);
  }

  const anchorKey = anchorContent.getKey();
  const isContinuing = progressionRef.current.anchorKey === anchorKey;
  const nextStage = isContinuing ? progressionRef.current.stage + 1 : 1;

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
    const subtreePlan = $createSubtreePlan(anchorContent);
    return subtreePlan ? { plan: subtreePlan, stage: 2 } : null;
  }

  const relative = stage - 3;
  const levelsUp = Math.floor((relative + 1) / 2);
  const includeSiblings = relative % 2 === 0;

  const targetContent = ascendContentItem(anchorContent, levelsUp);
  if (!targetContent) {
    const docPlan = $createDocumentPlan();
    return docPlan ? { plan: docPlan, stage } : null;
  }

  if (includeSiblings) {
    const parentList = targetContent.getParent();
    if ($isListNode(parentList)) {
      const parentParent = parentList.getParent();
      if (parentParent && parentParent === $getRoot()) {
        const docPlan = $createDocumentPlan();
        if (docPlan) {
          return { plan: docPlan, stage };
        }
      }
    }

    const siblingPlan = $createSiblingRangePlan(targetContent);
    if (siblingPlan) {
      return { plan: siblingPlan, stage };
    }

    return $buildPlanForStage(anchorContent, stage + 1);
  }

  const subtreePlan = $createSubtreePlan(targetContent);
  if (subtreePlan) {
    return { plan: subtreePlan, stage };
  }

  return $buildPlanForStage(anchorContent, stage + 1);
}

function $computeDirectionalPlan(
  progressionRef: React.MutableRefObject<ProgressiveSelectionState>,
  direction: 'up' | 'down'
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  if (selection.isCollapsed() && progressionRef.current.locked) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
  }

  let anchorContent: ListItemNode | null = null;
  if (progressionRef.current.anchorKey) {
    const storedAnchor = $getNodeByKey<ListItemNode>(progressionRef.current.anchorKey);
    if (storedAnchor) {
      anchorContent = getContentListItem(storedAnchor);
    }
  }

  if (!anchorContent) {
    const anchorItem = findNearestListItem(selection.anchor.getNode());
    if (!anchorItem) {
      progressionRef.current = INITIAL_PROGRESSIVE_STATE;
      return null;
    }
    anchorContent = getContentListItem(anchorItem);
  }

  const anchorKey = anchorContent.getKey();
  const isContinuing = progressionRef.current.locked && progressionRef.current.anchorKey === anchorKey;
  let stage = isContinuing ? progressionRef.current.stage : 0;
  const heads = $collectSelectionHeads(selection);

  const MAX_STAGE = 5;
  while (stage < MAX_STAGE + 1) {
    stage += 1;
    const planResult = $buildDirectionalStagePlan(anchorContent, heads, stage, direction);
    if (planResult) {
      return planResult;
    }

    if (stage >= MAX_STAGE) {
      break;
    }
  }

  return null;
}

function $buildDirectionalStagePlan(
  anchorContent: ListItemNode,
  heads: ListItemNode[],
  stage: number,
  direction: 'up' | 'down'
): ProgressivePlanResult | null {
  const anchorKey = anchorContent.getKey();
  const resolvedHeads = heads.length > 0 ? heads : [anchorContent];

  if (stage === 1) {
    const inlinePlan = $createInlinePlan(anchorContent);
    return inlinePlan ? { anchorKey, stage: 1, plan: inlinePlan } : null;
  }

  if (stage === 2) {
    const subtreePlan = $createSubtreePlan(anchorContent);
    return subtreePlan ? { anchorKey, stage: 2, plan: subtreePlan } : null;
  }

  if (stage === 3) {
    if (direction === 'down') {
      const lastHead = resolvedHeads.at(-1)!;
      const nextSibling = getNextContentSibling(lastHead);
      if (!nextSibling) {
        return null;
      }
      const planResult: ProgressivePlanResult = {
        anchorKey,
        stage: 3,
        plan: {
          type: 'range',
          startKey: resolvedHeads[0]!.getKey(),
          endKey: getSubtreeTail(nextSibling).getKey(),
          startMode: 'content',
          endMode: 'subtree',
        },
      };
      return planResult;
    }

    const firstHead = resolvedHeads[0]!;
    const previousSibling = getPreviousContentSibling(firstHead);
    if (!previousSibling) {
      return null;
    }
    const planResult: ProgressivePlanResult = {
      anchorKey,
      stage: 3,
      plan: {
        type: 'range',
        startKey: previousSibling.getKey(),
        endKey: getSubtreeTail(resolvedHeads.at(-1)!).getKey(),
        startMode: 'content',
        endMode: 'subtree',
      },
    };
    return planResult;
  }

  if (stage === 4) {
    const parentCandidate = getParentContentItem(resolvedHeads[0]!);
    if (!parentCandidate) {
      return null;
    }
    const alreadySelected = resolvedHeads.some((head) => head.getKey() === parentCandidate.getKey());
    if (alreadySelected) {
      return null;
    }
    const planResult: ProgressivePlanResult = {
      anchorKey,
      stage: 4,
      plan: {
        type: 'range',
        startKey: parentCandidate.getKey(),
        endKey: getSubtreeTail(parentCandidate).getKey(),
        startMode: 'content',
        endMode: 'subtree',
      },
    };
    return planResult;
  }

  const docPlan = $createDocumentPlan();
  if (!docPlan) {
    return null;
  }

  return {
    anchorKey,
    stage: 5,
    plan: docPlan,
  };
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
  const isLeaf = tail.getKey() === item.getKey();
  return {
    type: 'range',
    startKey: item.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: isLeaf ? 'content' : 'subtree',
  };
}

function $createSiblingRangePlan(item: ListItemNode): ProgressivePlan | null {
  const siblings = getContentSiblings(item);
  if (siblings.length <= 1) {
    return null;
  }

  const lastSibling = siblings.at(-1)!;
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

  const firstItem = getFirstDescendantListItem(list);
  const lastItem = getLastDescendantListItem(list);
  if (!firstItem || !lastItem) {
    return null;
  }

  const tail = getSubtreeTail(lastItem);
  return {
    type: 'range',
    startKey: firstItem.getKey(),
    endKey: tail.getKey(),
    startMode: 'content',
    endMode: 'subtree',
  };
}

function $hasInlineBoundary(item: ListItemNode): boolean {
  return Boolean(resolveContentBoundaryPoint(item, 'start') && resolveContentBoundaryPoint(item, 'end'));
}

function $applyProgressivePlan(result: ProgressivePlanResult): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  if (result.plan.type === 'inline') {
    const item = $getNodeByKey<ListItemNode>(result.plan.itemKey);
    if (!item) {
      return false;
    }
    if (!selectInlineContent(selection, item)) {
      return selectNoteBody(selection, item);
    }
    return true;
  }

  const startItem = $getNodeByKey<ListItemNode>(result.plan.startKey);
  const endItem = $getNodeByKey<ListItemNode>(result.plan.endKey);
  if (!startItem || !endItem) {
    return false;
  }

  return setSelectionBetweenItems(selection, startItem, endItem, result.plan.startMode, result.plan.endMode);
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

function collapseSelectionToCaret(selection: RangeSelection): boolean {
  const anchorNode = selection.anchor.getNode();

  if ($isTextNode(anchorNode)) {
    selection.setTextNodeRange(anchorNode, selection.anchor.offset, anchorNode, selection.anchor.offset);
    return true;
  }

  const anchorItem = findNearestListItem(anchorNode);
  if (!anchorItem) {
    return false;
  }

  const caretPoint = resolveContentBoundaryPoint(getContentListItem(anchorItem), 'start');
  if (!caretPoint) {
    return false;
  }

  selection.setTextNodeRange(caretPoint.node, caretPoint.offset, caretPoint.node, caretPoint.offset);
  return true;
}

function resolveContentBoundaryPoint(listItem: ListItemNode, edge: 'start' | 'end') {
  const textNode = findContentBoundaryTextNode(listItem, edge);
  if (!textNode) {
    return null;
  }

  const length = textNode.getTextContentSize();
  const offset = edge === 'start' ? 0 : length;
  return { node: textNode, offset } as const;
}

function $collectSelectionHeads(selection: RangeSelection): ListItemNode[] {
  const items = collectSelectedListItems(selection);
  if (items.length === 0) {
    return [];
  }

  const orderedContent = items.map((item) => getContentListItem(item));
  const seen = new Set<string>();
  const unique: ListItemNode[] = [];

  for (const item of orderedContent) {
    const key = item.getKey();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  const heads: ListItemNode[] = [];
  for (const item of unique) {
    let covered = false;
    for (const head of heads) {
      if (isDescendantOf(item, head)) {
        covered = true;
        break;
      }
    }
    if (covered) {
      continue;
    }

    for (let i = heads.length - 1; i >= 0; i -= 1) {
      if (isDescendantOf(heads[i]!, item)) {
        heads.splice(i, 1);
      }
    }

    heads.push(item);
  }

  return heads;
}

function getNextContentSibling(item: ListItemNode): ListItemNode | null {
  let sibling: LexicalNode | null = item.getNextSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isListItemWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getNextSibling();
  }
  return null;
}

function getPreviousContentSibling(item: ListItemNode): ListItemNode | null {
  let sibling: LexicalNode | null = item.getPreviousSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isListItemWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }
  return null;
}

function isDescendantOf(node: ListItemNode, ancestor: ListItemNode): boolean {
  let current: ListItemNode | null = node;
  while (current) {
    if (current.getKey() === ancestor.getKey()) {
      return true;
    }
    current = getParentContentItem(current);
  }
  return false;
}

function findContentBoundaryTextNode(listItem: ListItemNode, edge: 'start' | 'end'): TextNode | null {
  const children = listItem.getChildren();
  const ordered = edge === 'start' ? children : children.toReversed();

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
  if (!isListItemWrapper(item)) {
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
  if (!isWrapperNode(parentWrapper)) {
    return null;
  }

  const parentContent = parentWrapper.getPreviousSibling();
  return $isListItemNode(parentContent) ? parentContent : null;
}

function isListItemWrapper(node: ListItemNode): boolean {
  if (node.getChildren().length !== 1) {
    return false;
  }

  const firstChild = node.getFirstChild();
  return $isListNode(firstChild);
}

function isWrapperNode(node: LexicalNode | null | undefined): node is ListItemNode {
  return $isListItemNode(node) && isListItemWrapper(node);
}

function getWrapperForContent(item: ListItemNode): ListItemNode | null {
  const next = item.getNextSibling();
  if (!$isListItemNode(next) || !isListItemWrapper(next)) {
    return null;
  }

  return next;
}

function getSubtreeTail(item: ListItemNode): ListItemNode {
  const nestedList = getNestedList(item);
  if (!nestedList) {
    return item;
  }

  const lastChild = nestedList.getLastChild();
  if (!$isListItemNode(lastChild)) {
    return item;
  }

  return getSubtreeTail(lastChild);
}

function getNestedList(item: ListItemNode): ListNode | null {
  const wrapper = getWrapperForContent(item);
  if (wrapper) {
    const nested = wrapper.getFirstChild();
    if ($isListNode(nested)) {
      return nested;
    }
  }

  for (const child of item.getChildren()) {
    if ($isListNode(child)) {
      return child;
    }
  }

  return null;
}

function getContentSiblings(item: ListItemNode): ListItemNode[] {
  const parentList = item.getParent();
  if (!$isListNode(parentList)) {
    return [item];
  }

  const siblings: ListItemNode[] = [];
  for (const child of parentList.getChildren()) {
    if ($isListItemNode(child) && !isListItemWrapper(child)) {
      siblings.push(child);
    }
  }

  return siblings.length === 0 ? [item] : siblings;
}

function getFirstDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  for (const child of node.getChildren()) {
    if ($isListItemNode(child)) {
      if (isListItemWrapper(child)) {
        const nested = getNestedList(child);
        const match = getFirstDescendantListItem(nested);
        if (match) {
          return match;
        }
        continue;
      }

      return getContentListItem(child);
    }
  }

  return null;
}

function getLastDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  const children = node.getChildren();
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if ($isListItemNode(child)) {
      if (isListItemWrapper(child)) {
        continue;
      }

      const nested = getNestedList(child);
      const match = getLastDescendantListItem(nested);
      if (match) {
        return match;
      }
      return getContentListItem(child);
    }
  }

  return null;
}
