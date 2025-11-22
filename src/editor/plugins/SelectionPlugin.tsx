//TODO deserves a major refactor, cleanup and review
import type { ListItemNode, ListNode } from '@lexical/list';
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list';
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
  const structuralSelectionRef = useRef(false);
  const structuralSelectionRangeRef = useRef<StructuralSelectionRange | null>(null);
  const structuralSelectionKeysRef = useRef<string[] | null>(null);

  useEffect(() => {
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

    const setStructuralSelectionSummary = (keys: string[] | null) => {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        return;
      }

      if (keys && keys.length > 0) {
        rootElement.dataset.structuralSelectionKeys = keys.join(',');
      } else {
        delete rootElement.dataset.structuralSelectionKeys;
      }
    };

    const setStructuralSelectionActive = (isActive: boolean) => {
      if (structuralSelectionRef.current === isActive) {
        return;
      }

      structuralSelectionRef.current = isActive;
      applyStructuralSelectionAttribute();

      if (!isActive) {
        structuralSelectionRangeRef.current = null;
        structuralSelectionKeysRef.current = null;
        setStructuralSelectionSummary(null);
      }
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
      const { payload, hasStructuralSelection, structuralRange, noteKeys } = editorState.read(() => {
        let computedPayload: SnapPayload | null = null;
        let computedStructuralRange: StructuralSelectionRange | null = null;
        let computedNoteKeys: string[] = [];
        let hasStructuralSelection = false;

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
          return {
            payload: computedPayload,
            hasStructuralSelection,
            structuralRange: computedStructuralRange,
            noteKeys: computedNoteKeys,
          };
        }

        const noteItems = collectSelectedListItems(selection);
        if (noteItems.length > 0) {
          const normalized = normalizeContentRange(noteItems[0]!, noteItems.at(-1)!);
          if (!noteItems.includes(normalized.start)) {
            noteItems.unshift(normalized.start);
          }
          if (!noteItems.includes(normalized.end)) {
            noteItems.push(normalized.end);
          }
        }
        computedNoteKeys = noteItems.map((item) => getContentListItem(item).getKey());
        computedStructuralRange = computeStructuralRange(selection);

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

        return {
          payload: computedPayload,
          hasStructuralSelection,
          structuralRange: computedStructuralRange,
          noteKeys: computedNoteKeys,
        };
      });

      if (hasStructuralSelection && structuralRange) {
        structuralSelectionRangeRef.current = structuralRange;
        applyStructuralSelectionMetrics(structuralRange);
        setStructuralSelectionSummary(noteKeys);
        structuralSelectionKeysRef.current = noteKeys;
      } else {
        structuralSelectionRangeRef.current = null;
        clearStructuralSelectionMetrics();
        setStructuralSelectionSummary(null);
        structuralSelectionKeysRef.current = null;
      }

      setStructuralSelectionActive(hasStructuralSelection && structuralRange !== null);

      if (!payload) {
        return;
      }

      const nextPayload = payload;

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

    const applyPlan = (planResult: ProgressivePlanResult) => {
      editor.update(
        () => {
          const applied = $applyProgressivePlan(planResult);
          if (!applied) {
            progressionRef.current = INITIAL_PROGRESSIVE_STATE;
            return;
          }

          if (planResult.stage >= 2) {
            setStructuralSelectionActive(true);
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const range = computeStructuralRange(selection);
              if (range) {
                structuralSelectionRangeRef.current = range;
                applyStructuralSelectionMetrics(range);
              } else {
                structuralSelectionRangeRef.current = null;
              }
            }
          }

          progressionRef.current = {
            anchorKey: planResult.anchorKey,
            stage: getStoredStage(planResult),
            locked: true,
          };
        },
        { tag: [SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG] }
      );
    };

    const collapseStructuralSelectionToCaretAndReset = (
      edge: 'start' | 'end' | 'anchor' = 'anchor'
    ): boolean => {
      const range = structuralSelectionRangeRef.current;
      const hasCollapsibleSelection = editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && !selection.isCollapsed();
      });

      if (!hasCollapsibleSelection) {
        return false;
      }

      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          let handled = false;

          if (edge !== 'anchor' && range) {
            const targetKey = edge === 'start' ? range.caretStartKey : range.caretEndKey;
            handled = $applyCaretEdge(targetKey, edge);
          }

          if (!handled) {
            handled = collapseSelectionToCaret(selection);
            if (!handled) {
              return;
            }
          }

          progressionRef.current = INITIAL_PROGRESSIVE_STATE;
          unlockRef.current = { pending: false, reason: 'external' };
        },
        { tag: PROGRESSIVE_SELECTION_TAG }
      );

      setStructuralSelectionActive(false);
      structuralSelectionRangeRef.current = null;
      clearStructuralSelectionMetrics();

      return true;
    };

    const deleteStructuralSelection = (): boolean => {
      if (!structuralSelectionRef.current) {
        return false;
      }

      const structuralKeys = structuralSelectionKeysRef.current;
      if (!structuralKeys || structuralKeys.length === 0) {
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

      editor.update(
        () => {
          const structuralRange = structuralSelectionRangeRef.current;
          const appliedSelection = structuralRange ? $applyStructuralRange(structuralRange) : $getSelection();
          const selection = $isRangeSelection(appliedSelection) ? appliedSelection : null;

          const keyItems =
            structuralSelectionKeysRef.current
              ?.map((key) => $getNodeByKey<ListItemNode>(key))
              .filter((node): node is ListItemNode => $isListItemNode(node)) ?? [];

          let heads = collectHeadsFromListItems(keyItems).filter((node) => node.isAttached());

          if (heads.length === 0 && selection) {
            heads = collectSelectionHeads(selection).filter((node) => node.isAttached());
          }

          if (heads.length === 0) {
            return;
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

          structuralSelectionRangeRef.current = null;
          structuralSelectionKeysRef.current = null;
          progressionRef.current = INITIAL_PROGRESSIVE_STATE;
          unlockRef.current = { pending: false, reason: 'external' };
          setStructuralSelectionActive(false);
          clearStructuralSelectionMetrics();
        },
        { tag: PROGRESSIVE_SELECTION_TAG }
      );

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

        applyPlan(planResult);

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

    const runDirectionalPlan = (direction: 'up' | 'down') => {
      unlockRef.current = { pending: true, reason: 'directional' };

      editor.update(
        () => {
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
      (event: KeyboardEvent | null) => {
        const handled = collapseStructuralSelectionToCaretAndReset();
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
      if (!structuralSelectionRef.current) {
        return false;
      }

      if (!event) {
        return true;
      }

      return !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
    };

    const shouldHandlePlainHorizontalArrow = (event: KeyboardEvent | null): boolean => {
      if (!structuralSelectionRef.current) {
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

        const handled = collapseStructuralSelectionToCaretAndReset('end');
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

        const handled = collapseStructuralSelectionToCaretAndReset('start');
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

        const handled = collapseStructuralSelectionToCaretAndReset('end');
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
      if (!event || !structuralSelectionRef.current) {
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

        if (!event || !structuralSelectionRef.current) {
          return false;
        }

        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
          return false;
        }

        if (event.key !== 'Home' && event.key !== 'End' && event.key !== 'PageUp' && event.key !== 'PageDown') {
          return false;
        }

        const handled = collapseStructuralSelectionToCaretAndReset(
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

        const handled = collapseStructuralSelectionToCaretAndReset('start');
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
        if (!structuralSelectionRef.current) {
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
        if (!structuralSelectionRef.current) {
          return false;
        }
        const handled = deleteStructuralSelection();
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
        if (!structuralSelectionRef.current) {
          return false;
        }
        const handled = deleteStructuralSelection();
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
      structuralSelectionRef.current = false;
      const rootElement = editor.getRootElement();
      if (rootElement) {
        delete rootElement.dataset.structuralSelection;
        delete rootElement.dataset.structuralSelectionKeys;
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

  const noteItems = (() => {
    const items = collectSelectedListItems(selection);
    if (items.length > 0) {
      return items;
    }

    const anchorItem = findNearestListItem(selection.anchor.getNode());
    const focusItem = findNearestListItem(selection.focus.getNode());
    const merged = [anchorItem, focusItem].filter((item): item is ListItemNode => item != null);
    return merged.length > 0 ? merged.toSorted(compareDocumentOrder) : merged;
  })();
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
            const heads = collectSelectionHeads(selection);

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

  if (applyElementRangeBetweenItems(selection, startItem, endItem, startMode, endMode)) {
    return true;
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

  return items.toSorted(compareDocumentOrder);
}

function computeStructuralRange(selection: RangeSelection): StructuralSelectionRange | null {
  const noteItems = collectSelectedListItems(selection);
  if (noteItems.length === 0) {
    return null;
  }

  const heads = collectSelectionHeads(selection, noteItems);
  const caretItems = (heads.length > 0 ? heads : noteItems).map((item) => getContentListItem(item));
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

function collectHeadsFromListItems(items: ListItemNode[]): ListItemNode[] {
  const normalized = items.map((item) => getContentListItem(item));
  if (normalized.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const unique: ListItemNode[] = [];

  for (const item of normalized) {
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

function collectSelectionHeads(selection: RangeSelection, precomputed?: ListItemNode[]): ListItemNode[] {
  const items = precomputed ?? collectSelectedListItems(selection);
  if (items.length === 0) {
    return [];
  }

  return collectHeadsFromListItems(items);
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
  const heads = collectSelectionHeads(selection, noteItems);
  if (heads.length <= 1) {
    return null;
  }
  const firstParent = heads[0]!.getParent();
  if (!heads.every((head) => head.getParent() === firstParent)) {
    return null;
  }

  return {
    anchorKey: anchorContent.getKey(),
    stage: 3,
    locked: true,
  };
}

function findNearestListItem(node: LexicalNode | null): ListItemNode | null {
  let current: LexicalNode | null = node;
  while (current !== null) {
    if ($isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function normalizeContentRange(start: ListItemNode, end: ListItemNode): { start: ListItemNode; end: ListItemNode } {
  let first = start;
  let last = end;

  if (first !== last && !first.isBefore(last)) {
    [first, last] = [last, first];
  }

  let firstDepth = getContentDepth(first);
  let lastDepth = getContentDepth(last);

  while (firstDepth > lastDepth) {
    const parent = getParentContentItem(first);
    if (!parent) {
      break;
    }
    first = parent;
    firstDepth -= 1;
  }

  while (lastDepth > firstDepth) {
    const parent = getParentContentItem(last);
    if (!parent) {
      break;
    }
    last = parent;
    lastDepth -= 1;
  }

  let firstParent = first.getParent();
  let lastParent = last.getParent();
  while (firstParent && lastParent && firstParent !== lastParent) {
    const nextFirst = getParentContentItem(first);
    const nextLast = getParentContentItem(last);
    if (!nextFirst || !nextLast) {
      break;
    }
    first = nextFirst;
    last = nextLast;
    firstParent = first.getParent();
    lastParent = last.getParent();
  }

  return { start: first, end: last } as const;
}

function getContentDepth(item: ListItemNode): number {
  let depth = 0;
  let current: ListItemNode | null = getParentContentItem(item);
  while (current) {
    depth += 1;
    current = getParentContentItem(current);
  }
  return depth;
}

function getContentListItem(item: ListItemNode): ListItemNode {
  if (!isChildrenWrapper(item)) {
    return item;
  }

  const previous = item.getPreviousSibling();
  return $isListItemNode(previous) ? previous : item;
}

function getNextContentSibling(item: ListItemNode): ListItemNode | null {
  let sibling: LexicalNode | null = item.getNextSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isChildrenWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getNextSibling();
  }
  return null;
}

function getPreviousContentSibling(item: ListItemNode): ListItemNode | null {
  let sibling: LexicalNode | null = item.getPreviousSibling();
  while (sibling) {
    if ($isListItemNode(sibling) && !isChildrenWrapper(sibling)) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }
  return null;
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
  let parent: LexicalNode | null = child.getParent();

  while (parent) {
    path.push(child.getIndexWithinParent());
    child = parent;
    parent = child.getParent();
  }

  return path.toReversed();
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
  if (!$isListItemNode(parentWrapper) || !isChildrenWrapper(parentWrapper)) {
    return null;
  }

  const parentContent = parentWrapper.getPreviousSibling();
  return $isListItemNode(parentContent) ? parentContent : null;
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

function getHeadsSharingParent(heads: ListItemNode[], parentList: ListNode): ListItemNode[] {
  return heads.filter((head) => head.getParent() === parentList);
}

function sortHeadsByDocumentOrder(heads: ListItemNode[]): ListItemNode[] {
  return heads.toSorted(compareDocumentOrder);
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
  let nextAnchor: ListItemNode | null = getSubtreeTail(orderedHeads.at(-1)!);

  while (nextAnchor) {
    const nextSibling = getNextContentSibling(nextAnchor);
    if (nextSibling) {
      return { key: nextSibling.getKey(), edge: 'start' };
    }
    nextAnchor = getParentContentItem(nextAnchor);
  }

  let anchor: ListItemNode | null = orderedHeads[0]!;
  let fallbackParent: ListItemNode | null = null;

  while (anchor) {
    const previousSibling = getPreviousContentSibling(anchor);
    if (previousSibling) {
      const caretTarget = getSubtreeTail(previousSibling);
      return { key: caretTarget.getKey(), edge: 'end' };
    }

    const parent = getParentContentItem(anchor);
    if (!fallbackParent && parent) {
      fallbackParent = parent;
    }
    anchor = parent;
  }

  if (fallbackParent) {
    return { key: fallbackParent.getKey(), edge: 'start' };
  }

  return null;
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

function getFirstDescendantListItem(node: LexicalNode | null): ListItemNode | null {
  if (!$isListNode(node)) {
    return null;
  }

  for (const child of node.getChildren()) {
    if ($isListItemNode(child)) {
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

function getWrapperForContent(item: ListItemNode): ListItemNode | null {
  const next = item.getNextSibling();
  if (!$isListItemNode(next) || !isChildrenWrapper(next)) {
    return null;
  }
  return next;
}

function isChildrenWrapper(node: LexicalNode | null | undefined): boolean {
  return (
    $isListItemNode(node) &&
    node.getChildren().length === 1 &&
    $isListNode(node.getFirstChild())
  );
}

function removeNoteSubtree(item: ListItemNode) {
  const contentItem = getContentListItem(item);
  const parentList = contentItem.getParent();

  const wrapper = getWrapperForContent(contentItem);
  if (wrapper) {
    wrapper.remove();
  }

  contentItem.remove();

  if ($isListNode(parentList) && parentList.getChildrenSize() === 0) {
    const wrapper = parentList.getParent();
    if ($isListItemNode(wrapper) && isChildrenWrapper(wrapper)) {
      wrapper.remove();
    }
  }
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
        if (!event.shiftKey) {
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
        if (!event.shiftKey) {
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
