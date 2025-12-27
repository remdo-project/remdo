import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
import { findNearestListItem, getContentListItem } from '@/editor/outline/list-structure';
import {
  getContentSiblingsForItem,
  getFirstDescendantListItem,
  getLastDescendantListItem,
  getNextContentSibling,
  getParentContentItem,
  getPreviousContentSibling,
  removeNoteSubtree,
  getSubtreeTail,
  normalizeContentRange,
  sortHeadsByDocumentOrder,
} from '@/editor/outline/selection/tree';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { reportInvariant } from '@/editor/invariant';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  SELECT_ALL_COMMAND,
  createCommand,
} from 'lexical';
import type { LexicalNode, RangeSelection, TextNode } from 'lexical';
import type { OutlineSelection } from '@/editor/outline/selection/model';
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
  repeatStage?: boolean;
}

function getStoredStage(result: ProgressivePlanResult): number {
  if (result.repeatStage && result.stage > 0) {
    return result.stage - 1;
  }
  return result.stage;
}

interface StructuralSelectionRange {
  caretStartKey: string;
  caretEndKey: string;
  visualStartKey: string;
  visualEndKey: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const PROGRESSIVE_SELECTION_DIRECTION_COMMAND = createCommand<{
  direction: 'up' | 'down';
}>('selection:progressive-direction');

export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const progressionRef = useRef<ProgressiveSelectionState>(INITIAL_PROGRESSIVE_STATE);
  const unlockRef = useRef<ProgressiveUnlockState>({ pending: false, reason: 'external' });
  const pendingSnapPayloadRef = useRef<SnapPayload | null>(null);
  const pendingSnapScheduledRef = useRef(false);

  useEffect(() => {
    const disposedRef = { current: false };
    installOutlineSelectionHelpers(editor);

    const addUpdateTags = (tags: string | string[]) => {
      const internal = editor as unknown as { _updateTags?: Set<string> };
      const tagSet = internal._updateTags;
      if (!tagSet) return;

      if (Array.isArray(tags)) {
        for (const tag of tags) tagSet.add(tag);
      } else {
        tagSet.add(tags);
      }
    };

    const scheduleSnapSelection = (payload: SnapPayload) => {
      pendingSnapPayloadRef.current = payload;
      if (pendingSnapScheduledRef.current) return;
      pendingSnapScheduledRef.current = true;

      queueMicrotask(() => {
        pendingSnapScheduledRef.current = false;
        if (disposedRef.current) return;

        const nextPayload = pendingSnapPayloadRef.current;
        pendingSnapPayloadRef.current = null;
        if (!nextPayload) return;

        editor.update(
          () => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            const anchorItem = $getNodeByKey<ListItemNode>(nextPayload.anchorKey);
            const focusItem = $getNodeByKey<ListItemNode>(nextPayload.focusKey);
            if (!anchorItem || !focusItem) {
              return;
            }

            const anchorPoint = resolveBoundaryPoint(anchorItem, nextPayload.anchorEdge);
            const focusPoint = resolveBoundaryPoint(focusItem, nextPayload.focusEdge);
            if (!anchorPoint || !focusPoint) {
              return;
            }

            selection.setTextNodeRange(anchorPoint.node, anchorPoint.offset, focusPoint.node, focusPoint.offset);
          },
          { tag: SNAP_SELECTION_TAG }
        );
      });
    };

    const clearStructuralSelectionMetrics = () => {
  const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }
      rootElement.style.removeProperty('--structural-selection-top');
      rootElement.style.removeProperty('--structural-selection-height');
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

      const startElement = editor.getElementByKey(range.visualStartKey);
      const endElement = editor.getElementByKey(range.visualEndKey);
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

    const applyStructuralSelectionClass = (isActive: boolean) => {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }

      rootElement.classList.toggle('editor-input--structural', isActive);
    };

    const setStructuralSelectionActive = (isActive: boolean) => {
      if (editor.selection.isStructural() === isActive) {
        return;
      }

      applyStructuralSelectionClass(isActive);

      if (!isActive) {
        clearStructuralSelectionMetrics();
      }
    };

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      if (previousRootElement) {
        previousRootElement.classList.toggle('editor-input--structural', false);
      }

      if (!rootElement) {
        return;
      }

      rootElement.classList.toggle('editor-input--structural', editor.selection.isStructural());
    });

    const unregisterProgressionListener = editor.registerUpdateListener(({ editorState, tags }) => {
      const { payload, hasStructuralSelection, structuralRange, outlineSelection } = editorState.read(() => {
        let computedPayload: SnapPayload | null = null;
        let computedStructuralRange: StructuralSelectionRange | null = null;
        let computedNoteKeys: string[] = [];
        let hasStructuralSelection = false;
        let computedOutlineSelection: OutlineSelection | null = null;

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

        if (!$isRangeSelection(selection)) {
          return {
            payload: computedPayload,
            hasStructuralSelection,
            structuralRange: computedStructuralRange,
            outlineSelection: computedOutlineSelection,
          };
        }

        const anchorItem = findNearestListItem(selection.anchor.getNode());
        const focusItem = findNearestListItem(selection.focus.getNode());
        const anchorKey = anchorItem ? getContentListItem(anchorItem).getKey() : null;
        const focusKey = focusItem ? getContentListItem(focusItem).getKey() : null;
        const isBackward = selection.isBackward();

        if (selection.isCollapsed()) {
          computedOutlineSelection = {
            kind: 'caret',
            stage: 0,
            anchorKey,
            focusKey,
            headKeys: [],
            range: null,
            isBackward,
          };
          return {
            payload: computedPayload,
            hasStructuralSelection,
            structuralRange: computedStructuralRange,
            outlineSelection: computedOutlineSelection,
          };
        }

        const heads = getContiguousSelectionHeads(selection);
        const noteItems = heads;
        computedNoteKeys = noteItems.map((item) => getContentListItem(item).getKey());
        computedStructuralRange = computeStructuralRangeFromHeads(noteItems);
        if (noteItems.length > 0 && !computedStructuralRange) {
          reportInvariant({
            message: 'Structural range missing despite non-empty heads',
            context: { headCount: noteItems.length },
          });
        }

        const hasMultiNoteRange = noteItems.length > 1;
        const isProgressiveStructural = progressionRef.current.locked && progressionRef.current.stage >= 2;
        hasStructuralSelection = isProgressiveStructural || hasMultiNoteRange;
        if (!progressionRef.current.locked && hasMultiNoteRange) {
          const inferredProgression = $inferPointerProgressionState(selection, noteItems);
          if (inferredProgression) {
            progressionRef.current = inferredProgression;
          }
        }
        const overrideAnchorKey =
          progressionRef.current.locked && progressionRef.current.stage >= 2
            ? progressionRef.current.anchorKey
            : null;

        if (!tags.has(SNAP_SELECTION_TAG) && noteItems.length >= 2) {
          const candidate = $createSnapPayload(selection, noteItems, overrideAnchorKey);
          if (candidate && !selectionMatchesPayload(selection, candidate)) {
            computedPayload = candidate;
          }
        }

        const stage = progressionRef.current.locked
          ? progressionRef.current.stage
          : hasStructuralSelection
            ? 2
            : 1;

        computedOutlineSelection = {
          kind: hasStructuralSelection ? 'structural' : 'inline',
          stage,
          anchorKey,
          focusKey,
          headKeys: hasStructuralSelection ? computedNoteKeys : [],
          range: hasStructuralSelection ? computedStructuralRange : null,
          isBackward,
        };

        return {
          payload: computedPayload,
          hasStructuralSelection,
          structuralRange: computedStructuralRange,
          outlineSelection: computedOutlineSelection,
        };
      });

      if (hasStructuralSelection && structuralRange) {
        applyStructuralSelectionMetrics(structuralRange);
      } else {
        clearStructuralSelectionMetrics();
      }

      setStructuralSelectionActive(hasStructuralSelection && structuralRange !== null);
      editor.selection.set(outlineSelection);

      if (!payload) {
        return;
      }

      const nextPayload = payload;

      scheduleSnapSelection(nextPayload);
    });

    const $applyPlan = (planResult: ProgressivePlanResult) => {
      addUpdateTags([SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG]);

      const applied = $applyProgressivePlan(planResult);
      if (!applied) {
        progressionRef.current = INITIAL_PROGRESSIVE_STATE;
        return;
      }

      if (planResult.stage >= 2) {
        setStructuralSelectionActive(true);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const currentSlice = getContiguousSelectionHeads(selection);
          const range = computeStructuralRangeFromHeads(currentSlice);
          if (range) {
            applyStructuralSelectionMetrics(range);
          } else {
            clearStructuralSelectionMetrics();
          }
        }
      }

      progressionRef.current = {
        anchorKey: planResult.anchorKey,
        stage: getStoredStage(planResult),
        locked: true,
      };
    };

    const $collapseStructuralSelectionToCaretAndReset = (
      edge: 'start' | 'end' | 'anchor' = 'anchor'
    ): boolean => {
      const range = editor.selection.get()?.range ?? null;
      const hasCollapsibleSelection = editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && !selection.isCollapsed();
      });

      if (!hasCollapsibleSelection) {
        return false;
      }

      addUpdateTags(PROGRESSIVE_SELECTION_TAG);

      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        let handled = false;

        if (edge !== 'anchor' && range) {
          const targetKey = edge === 'start' ? range.caretStartKey : range.caretEndKey;
          handled = $applyCaretEdge(targetKey, edge);
        }

        if (!handled) {
          handled = collapseSelectionToCaret(selection);
        }

        if (handled) {
          progressionRef.current = INITIAL_PROGRESSIVE_STATE;
          unlockRef.current = { pending: false, reason: 'external' };
        }
      }

      setStructuralSelectionActive(false);
      clearStructuralSelectionMetrics();

      return true;
    };

    const $deleteStructuralSelection = (): boolean => {
      if (!editor.selection.isStructural()) {
        return false;
      }

      const outlineSelection = editor.selection.get();
      const structuralKeys = outlineSelection?.headKeys ?? [];
      if (structuralKeys.length === 0) {
        return false;
      }

      const hasAttachedSelection = editor.getEditorState().read(() => {
        return structuralKeys.some((key) => {
          const node = $getNodeByKey<ListItemNode>(key);
          return $isListItemNode(node) && node.isAttached();
        });
      });

      if (!hasAttachedSelection) {
        return false;
      }

      addUpdateTags(PROGRESSIVE_SELECTION_TAG);

      const structuralRange = outlineSelection?.range ?? null;
      const appliedSelection = structuralRange ? $applyStructuralRange(structuralRange) : $getSelection();
      const selection = $isRangeSelection(appliedSelection) ? appliedSelection : null;

      const keyItems = structuralKeys
        .map((key) => $getNodeByKey<ListItemNode>(key))
        .filter((node): node is ListItemNode => $isListItemNode(node));

      let heads = keyItems.filter((node) => node.isAttached());

      if (heads.length === 0 && selection) {
        heads = getContiguousSelectionHeads(selection);
      }

      if (heads.length === 0) {
        reportInvariant({
          message: 'Structural delete invoked with no attached heads',
          context: { keyCount: structuralKeys.length },
        });
        return true;
      }

      const caretPlan = resolveCaretTargetAfterDeletion(heads);
      const orderedHeads = sortHeadsByDocumentOrder(heads);

      for (const head of orderedHeads.toReversed()) {
        removeNoteSubtree(head);
      }

      let caretApplied = false;
      if (caretPlan) {
        caretApplied = $applyCaretEdge(caretPlan.key, caretPlan.edge);
      }

      if (!caretApplied) {
        const root = $getRoot();
        let list = root.getFirstChild();

        if (!$isListNode(list)) {
          const newList = $createListNode('bullet');
          root.append(newList);
          list = newList;
        }

        if ($isListNode(list)) {
          const first = getFirstDescendantListItem(list);
          let targetItem: ListItemNode | null = null;

          if (first) {
            targetItem = getContentListItem(first);
          } else {
            const listItem = $createListItemNode();
            listItem.append($createParagraphNode());
            list.append(listItem);
            targetItem = listItem;
          }

          caretApplied = $applyCaretEdge(targetItem.getKey(), 'start');
        }
      }

      if (!caretApplied && selection) {
        collapseSelectionToCaret(selection);
      }

      progressionRef.current = INITIAL_PROGRESSIVE_STATE;
      unlockRef.current = { pending: false, reason: 'external' };
      setStructuralSelectionActive(false);
      clearStructuralSelectionMetrics();

      return true;
    };

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event: KeyboardEvent | null) => {
        const planResult = editor.getEditorState().read(() => $computeProgressivePlan(progressionRef));

        if (!planResult) {
          return false;
        }

        event?.preventDefault();

        $applyPlan(planResult);

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterArrowLeft = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event || !event.shiftKey) {
          return false;
        }

        const shouldBlock = editor.getEditorState().read(() => $shouldBlockHorizontalArrow('left'));

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
      (event: KeyboardEvent | null) => {
        if (!event || !event.shiftKey) {
          return false;
        }

        const shouldBlock = editor.getEditorState().read(() => $shouldBlockHorizontalArrow('right'));

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

    const $runDirectionalPlan = (direction: 'up' | 'down') => {
      unlockRef.current = { pending: true, reason: 'directional' };

      addUpdateTags([SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG]);

      const planResult = $computeDirectionalPlan(progressionRef, direction);
      if (!planResult) {
        progressionRef.current = INITIAL_PROGRESSIVE_STATE;
        return;
      }

      const applied = $applyProgressivePlan(planResult);
      if (!applied) {
        progressionRef.current = INITIAL_PROGRESSIVE_STATE;
        return;
      }

      progressionRef.current = {
        anchorKey: planResult.anchorKey,
        stage: getStoredStage(planResult),
        locked: true,
      };
    };

    const unregisterDirectionalCommand = editor.registerCommand(
      PROGRESSIVE_SELECTION_DIRECTION_COMMAND,
      ({ direction }) => {
        $runDirectionalPlan(direction);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event: KeyboardEvent | null) => {
        const handled = $collapseStructuralSelectionToCaretAndReset();
        if (!handled) {
          return false;
        }

        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const shouldHandlePlainVerticalArrow = (event: KeyboardEvent | null): boolean => {
      if (!editor.selection.isStructural()) {
        return false;
      }

      if (!event) {
        return true;
      }

      return !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
    };

    const shouldHandlePlainHorizontalArrow = (event: KeyboardEvent | null): boolean => {
      if (!editor.selection.isStructural()) {
        return false;
      }

      if (!event) {
        return true;
      }

      return !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
    };

    const unregisterPlainArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!shouldHandlePlainVerticalArrow(event)) {
          return false;
        }

        const handled = $collapseStructuralSelectionToCaretAndReset('end');
        if (!handled) {
          return false;
        }

        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterPlainArrowLeft = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!shouldHandlePlainHorizontalArrow(event)) {
          return false;
        }

        const handled = $collapseStructuralSelectionToCaretAndReset('start');
        if (!handled) {
          return false;
        }

        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterPlainArrowRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!shouldHandlePlainHorizontalArrow(event)) {
          return false;
        }

        const handled = $collapseStructuralSelectionToCaretAndReset('end');
        if (!handled) {
          return false;
        }

        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const shouldBlockTypingInStructuralMode = (event: KeyboardEvent | null): boolean => {
      if (!event || !editor.selection.isStructural()) {
        return false;
      }
      if (event.altKey || event.metaKey || event.ctrlKey) {
        return false;
      }
      return event.key.length === 1;
    };

    const unregisterHomeEnd = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent | null) => {
        if (shouldBlockTypingInStructuralMode(event)) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          return true;
        }

        if (!event || !editor.selection.isStructural()) {
          return false;
        }

        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
          return false;
        }

        if (event.key !== 'Home' && event.key !== 'End' && event.key !== 'PageUp' && event.key !== 'PageDown') {
          return false;
        }

        const handled = $collapseStructuralSelectionToCaretAndReset(
          event.key === 'Home' || event.key === 'PageUp' ? 'start' : 'end'
        );
        if (!handled) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterPlainArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!shouldHandlePlainVerticalArrow(event)) {
          return false;
        }

        const handled = $collapseStructuralSelectionToCaretAndReset('start');
        if (!handled) {
          return false;
        }

        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!editor.selection.isStructural()) {
          return false;
        }

        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!editor.selection.isStructural()) {
          return false;
        }
        const handled = $deleteStructuralSelection();
        if (!handled) {
          return false;
        }
        event?.preventDefault();
        event?.stopPropagation();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!editor.selection.isStructural()) {
          return false;
        }
        const handled = $deleteStructuralSelection();
        if (!handled) {
          return false;
        }
        event?.preventDefault();
        event?.stopPropagation();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      disposedRef.current = true;
      const rootElement = editor.getRootElement();
      if (rootElement) {
        rootElement.classList.toggle('editor-input--structural', false);
      }
      clearStructuralSelectionMetrics();
      unregisterProgressionListener();
      unregisterSelectAll();
      unregisterArrowLeft();
      unregisterArrowRight();
      unregisterPlainArrowLeft();
      unregisterPlainArrowRight();
      unregisterDirectionalCommand();
      unregisterPlainArrowDown();
      unregisterPlainArrowUp();
      unregisterHomeEnd();
      unregisterEnter();
      unregisterDelete();
      unregisterBackspace();
      unregisterEscape();
      unregisterRootListener();
    };
  }, [editor]);

  return null;
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

  const selectionListItems: ListItemNode[] = [];
  const seen = new Set<string>();
  for (const node of selection.getNodes()) {
    const listItem = findNearestListItem(node);
    if (!listItem) continue;
    const key = listItem.getKey();
    if (seen.has(key)) continue;
    seen.add(key);
    selectionListItems.push(listItem);
  }

  const isCollapsed = selection.isCollapsed();
  if (!isCollapsed && selectionListItems.length > 1) {
    return true; // already structural, block horizontal expansion
  }

  const targetItem =
    selectionListItems[0] ??
    (isCollapsed ? findNearestListItem(selection.focus.getNode()) : null);
  if (!targetItem) {
    return false;
  }

  const contentItem = getContentListItem(targetItem);
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

function $createSnapPayload(
  selection: RangeSelection,
  items: ListItemNode[],
  overrideAnchorKey?: string | null
): SnapPayload | null {
  if (items.length === 0) {
    return null;
  }

  const anchorNode = overrideAnchorKey ? $getNodeByKey<ListItemNode>(overrideAnchorKey) : findNearestListItem(selection.anchor.getNode());
  const focusNode = findNearestListItem(selection.focus.getNode());
  if (!anchorNode || !focusNode) {
    return null;
  }

  const anchorContent = getContentListItem(anchorNode);
  const focusContent = getContentListItem(focusNode);
  const normalizedRange = normalizeContentRange(anchorContent, focusContent);
  const startContent = normalizedRange.start;
  const endContent = normalizedRange.end;
  const isBackward = selection.isBackward();
  const structuralStart = startContent;
  const structuralEnd = getSubtreeTail(endContent);
  const anchorBoundary = isBackward ? structuralEnd : structuralStart;
  const focusBoundary = isBackward ? structuralStart : structuralEnd;

  return {
    anchorKey: anchorBoundary.getKey(),
    focusKey: focusBoundary.getKey(),
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

  const children = (node as any).getChildren?.() ?? [];
  const ordered = edge === 'start' ? children : children.toReversed();

  for (const child of ordered) {
    const match = findBoundaryTextNode(child, edge);
    if (match) {
      return match;
    }
  }

  return null;
}

function $computeProgressivePlan(
	progressionRef: React.RefObject<ProgressiveSelectionState>
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  if (selection.isCollapsed()) {
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
      reportInvariant({
        message: 'Directional plan could not find anchor list item',
      });
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
    if (isEmptyNoteBody(anchorContent)) {
      const subtreePlan = $createSubtreePlan(anchorContent);
      return subtreePlan ? { plan: subtreePlan, stage: 2 } : null;
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
	progressionRef: React.RefObject<ProgressiveSelectionState>,
	direction: 'up' | 'down'
): ProgressivePlanResult | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    progressionRef.current = INITIAL_PROGRESSIVE_STATE;
    return null;
  }

  if (selection.isCollapsed()) {
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
  const heads = getContiguousSelectionHeads(selection);

  const MAX_STAGE = 64;
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

  const relative = stage - 3;
  if (relative < 0) {
    return null;
  }

  const levelsUp = Math.floor((relative + 1) / 2);
  const isSiblingStage = relative % 2 === 0;
  const target = levelsUp === 0 ? anchorContent : ascendContentItem(anchorContent, levelsUp);

  if (!target) {
    const docPlan = $createDocumentPlan();
    if (!docPlan) {
      return null;
    }
    return { anchorKey, stage, plan: docPlan };
  }

  const allHeads = resolvedHeads.length > 0 ? resolvedHeads : [anchorContent];
  const sortedHeads = sortHeadsByDocumentOrder(allHeads);

  if (isSiblingStage) {
    return $buildDirectionalSiblingPlan(target, resolvedHeads, sortedHeads, direction, anchorKey, stage);
  }

  return $buildDirectionalAncestorPlan(target, resolvedHeads, anchorKey, stage);
}

function $buildDirectionalSiblingPlan(
  target: ListItemNode,
  resolvedHeads: ListItemNode[],
  sortedHeads: ListItemNode[],
  direction: 'up' | 'down',
  anchorKey: string,
  stage: number
): ProgressivePlanResult | null {
  const siblingList = target.getParent();
  if (!$isListNode(siblingList)) {
    return null;
  }

  const headsAtLevel = getHeadsSharingParent(resolvedHeads, siblingList);
  if (headsAtLevel.length === 0) {
    headsAtLevel.push(target);
  }
  const sortedLevelHeads = sortHeadsByDocumentOrder(headsAtLevel);

  if (direction === 'down') {
    const forwardBoundary = sortedLevelHeads.at(-1)!;
    let sibling = getNextContentSibling(forwardBoundary);
    let extendDirection: 'forward' | 'backward' = 'forward';

    if (!sibling) {
      const backwardBoundary = sortedLevelHeads[0]!;
      sibling = getPreviousContentSibling(backwardBoundary);
      extendDirection = 'backward';
    }

    if (!sibling) {
      return null;
    }

    const plan: ProgressivePlan =
      extendDirection === 'forward'
        ? {
            type: 'range',
            startKey: sortedHeads[0]!.getKey(),
            endKey: getSubtreeTail(sibling).getKey(),
            startMode: 'content',
            endMode: 'subtree',
          }
        : {
            type: 'range',
            startKey: sibling.getKey(),
            endKey: getSubtreeTail(sortedHeads.at(-1)!).getKey(),
            startMode: 'content',
            endMode: 'subtree',
          };

    const repeatStage =
      extendDirection === 'forward'
        ? Boolean(getNextContentSibling(sibling))
        : Boolean(getPreviousContentSibling(sibling));

    return {
      anchorKey,
      stage,
      plan,
      repeatStage,
    };
  }

  const backwardBoundary = sortedLevelHeads[0]!;
  let sibling = getPreviousContentSibling(backwardBoundary);
  let extendDirection: 'forward' | 'backward' = 'backward';

  if (!sibling) {
    const forwardBoundary = sortedLevelHeads.at(-1)!;
    sibling = getNextContentSibling(forwardBoundary);
    extendDirection = 'forward';
  }

  if (!sibling) {
    return null;
  }

  const plan: ProgressivePlan =
    extendDirection === 'backward'
      ? {
          type: 'range',
          startKey: sibling.getKey(),
          endKey: getSubtreeTail(sortedHeads.at(-1)!).getKey(),
          startMode: 'content',
          endMode: 'subtree',
        }
      : {
          type: 'range',
          startKey: sortedHeads[0]!.getKey(),
          endKey: getSubtreeTail(sibling).getKey(),
          startMode: 'content',
          endMode: 'subtree',
        };

  const repeatStage =
    extendDirection === 'backward'
      ? Boolean(getPreviousContentSibling(sibling))
      : Boolean(getNextContentSibling(sibling));

  return {
    anchorKey,
    stage,
    plan,
    repeatStage,
  };
}

function $buildDirectionalAncestorPlan(
  target: ListItemNode,
  resolvedHeads: ListItemNode[],
  anchorKey: string,
  stage: number
): ProgressivePlanResult | null {
  const alreadySelected = resolvedHeads.some((head) => head.getKey() === target.getKey());
  if (alreadySelected) {
    return null;
  }

  const plan = $createSubtreePlan(target);
  if (!plan) {
    return null;
  }

  return {
    anchorKey,
    stage,
    plan,
  };
}

function $createInlinePlan(item: ListItemNode): ProgressivePlan | null {
  if (isEmptyNoteBody(item)) {
    return null;
  }
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
  const siblings = getContentSiblingsForItem(item);
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

function isEmptyNoteBody(item: ListItemNode): boolean {
  const contentItem = getContentListItem(item);
  const pieces: string[] = [];

  for (const child of contentItem.getChildren()) {
    if ($isListNode(child)) {
      continue;
    }
    const getTextContent = (child as { getTextContent?: () => string }).getTextContent;
    if (typeof getTextContent === 'function') {
      pieces.push(getTextContent.call(child));
    }
  }

  return pieces.join('').trim().length === 0;
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
  if (applyElementRangeBetweenItems(selection, startItem, endItem, startMode, endMode)) {
    return true;
  }

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

function applyElementRangeBetweenItems(
  selection: RangeSelection,
  startItem: ListItemNode,
  endItem: ListItemNode,
  startMode: BoundaryMode,
  endMode: BoundaryMode
): boolean {
  const anchorItem = resolveElementBoundaryItem(startItem, startMode, 'start');
  const focusItem = resolveElementBoundaryItem(endItem, endMode, 'end');

  if (!anchorItem || !focusItem) {
    return false;
  }

  selection.anchor.set(anchorItem.getKey(), 0, 'element');
  selection.focus.set(focusItem.getKey(), focusItem.getChildrenSize(), 'element');
  selection.dirty = true;

  if (!selection.isCollapsed()) {
    return true;
  }

  if (anchorItem === focusItem) {
    const parent = anchorItem.getParent();
    if ($isListNode(parent)) {
      const siblings = parent.getChildren();
      const index = siblings.indexOf(anchorItem);
      if (index !== -1) {
        selection.anchor.set(parent.getKey(), index, 'element');
        selection.focus.set(parent.getKey(), index + 1, 'element');
        selection.dirty = true;
      }
    }
  }

  return true;
}

function resolveElementBoundaryItem(
  item: ListItemNode,
  mode: BoundaryMode,
  edge: 'start' | 'end'
): ListItemNode | null {
  if (mode === 'subtree' && edge === 'end') {
    const tail = getSubtreeTail(item);
    return getContentListItem(tail);
  }

  return getContentListItem(item);
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

function $applyCaretEdge(itemKey: string, edge: 'start' | 'end'): boolean {
  const targetItem = $getNodeByKey<ListItemNode>(itemKey);
  if (!targetItem) {
    return false;
  }

  const contentItem = getContentListItem(targetItem);
  const selectableContent = contentItem as ListItemNode & {
    selectStart?: () => RangeSelection;
    selectEnd?: () => RangeSelection;
  };
  const selectEdge = edge === 'start' ? selectableContent.selectStart : selectableContent.selectEnd;

  if (typeof selectEdge === 'function') {
    selectEdge.call(selectableContent);
    return true;
  }

  const boundary = resolveContentBoundaryPoint(contentItem, edge) ?? resolveBoundaryPoint(contentItem, edge);
  if (!boundary) {
    return false;
  }

  const selectable = boundary.node as TextNode & { select?: (anchor: number, focus: number) => void };
  if (typeof selectable.select === 'function') {
    const offset = boundary.offset;
    selectable.select(offset, offset);
    return true;
  }

  const selection = $createRangeSelection();
  selection.setTextNodeRange(boundary.node, boundary.offset, boundary.node, boundary.offset);
  $setSelection(selection);
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

function computeStructuralRangeFromHeads(heads: ListItemNode[]): StructuralSelectionRange | null {
  const noteItems = heads;
  if (noteItems.length === 0) {
    reportInvariant({
      message: 'Structural range computed with no heads',
    });
    return null;
  }

  const caretItems = noteItems.map((item) => getContentListItem(item));
  const caretStartItem = caretItems[0]!;
  const caretEndItem = caretItems.at(-1)!;
  const visualEndItem = getSubtreeTail(caretEndItem);

  return {
    caretStartKey: caretStartItem.getKey(),
    caretEndKey: caretEndItem.getKey(),
    visualStartKey: caretStartItem.getKey(),
    visualEndKey: visualEndItem.getKey(),
  } satisfies StructuralSelectionRange;
}

function $inferPointerProgressionState(
  selection: RangeSelection,
  noteItems: ListItemNode[]
): ProgressiveSelectionState | null {
  const anchorItem = findNearestListItem(selection.anchor.getNode());
  if (!anchorItem) {
    return null;
  }
  const anchorContent = getContentListItem(anchorItem);
  const heads = noteItems.length > 0 ? noteItems : getContiguousSelectionHeads(selection);
  if (heads.length <= 1) {
    return null;
  }
  const firstParent = heads[0]!.getParent();
  if (!heads.every((head: ListItemNode) => head.getParent() === firstParent)) {
    return null;
  }

  return {
    anchorKey: anchorContent.getKey(),
    stage: 3,
    locked: true,
  };
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

function getHeadsSharingParent(heads: ListItemNode[], parentList: ListNode): ListItemNode[] {
  return heads.filter((head) => head.getParent() === parentList);
}

interface CaretEdgePlan {
  key: string;
  edge: 'start' | 'end';
}

function resolveCaretTargetAfterDeletion(heads: ListItemNode[]): CaretEdgePlan | null {
  if (heads.length === 0) {
    return null;
  }

  const orderedHeads = sortHeadsByDocumentOrder(heads);
  const lastHead = orderedHeads.at(-1)!;
  const nextSibling = getNextContentSibling(lastHead);
  if (nextSibling) {
    return { key: nextSibling.getKey(), edge: 'start' };
  }

  const firstHead = orderedHeads[0]!;
  const previousSibling = getPreviousContentSibling(firstHead);
  if (previousSibling) {
    const caretTarget = getSubtreeTail(previousSibling);
    return { key: caretTarget.getKey(), edge: 'end' };
  }

  const parent = getParentContentItem(firstHead);
  if (parent) {
    return { key: parent.getKey(), edge: 'end' };
  }

  return null;
}

function $applyStructuralRange(range: StructuralSelectionRange): RangeSelection | null {
  const selection = $createRangeSelection();
  const startNode = $getNodeByKey<ListItemNode>(range.visualStartKey);
  const endNode = $getNodeByKey<ListItemNode>(range.visualEndKey);
  if (!startNode || !endNode) {
    return null;
  }

  const startPoint = resolveBoundaryPoint(startNode, 'start');
  const endPoint = resolveBoundaryPoint(endNode, 'end');
  if (!startPoint || !endPoint) {
    return null;
  }

  selection.setTextNodeRange(startPoint.node, startPoint.offset, endPoint.node, endPoint.offset);
  $setSelection(selection);
  return selection;
}

export function SelectionInputPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterArrowUp = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (!event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
          return false;
        }

        event.preventDefault();
        editor.dispatchCommand(PROGRESSIVE_SELECTION_DIRECTION_COMMAND, { direction: 'up' });
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterArrowDown = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
          return false;
        }

        event.preventDefault();
        editor.dispatchCommand(PROGRESSIVE_SELECTION_DIRECTION_COMMAND, { direction: 'down' });
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      unregisterArrowUp();
      unregisterArrowDown();
    };
  }, [editor]);

  return null;
}
