import type { ListItemNode } from '@lexical/list';
import { collapseSelectionToCaret, resolveBoundaryPoint } from '@/editor/outline/selection/caret';
import { $applyCaretEdge } from '@/editor/outline/selection/apply';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND } from '@/editor/commands';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { $shouldBlockHorizontalArrow } from '@/editor/outline/selection/navigation';
import {
  $applyProgressivePlan,
  $computeDirectionalPlan,
  $computeProgressivePlan,
  INITIAL_PROGRESSIVE_STATE,
} from '@/editor/outline/selection/progressive';
import type { ProgressivePlanResult } from '@/editor/outline/selection/progressive';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  SELECT_ALL_COMMAND,
  createCommand,
} from 'lexical';
import type { OutlineSelectionRange } from '@/editor/outline/selection/model';
import type { ProgressiveSelectionState, SnapPayload } from '@/editor/outline/selection/resolve';
import { $computeOutlineSelectionSnapshot } from '@/editor/outline/selection/snapshot';
import type { ProgressiveUnlockState } from '@/editor/outline/selection/snapshot';
import { useEffect, useRef } from 'react';

const PROGRESSIVE_SELECTION_TAG = 'selection:progressive-range';
const SNAP_SELECTION_TAG = 'selection:snap-range';

function getStoredStage(result: ProgressivePlanResult): number {
  if (result.repeatStage && result.stage > 0) {
    return result.stage - 1;
  }
  return result.stage;
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

    const renderStructuralHighlight = (
      range: OutlineSelectionRange | null,
      isActive: boolean,
      rootElement = editor.getRootElement()
    ) => {
      if (!rootElement) {
        return;
      }

      rootElement.classList.toggle('editor-input--structural', isActive);

      if (!isActive || !range) {
        rootElement.style.removeProperty('--structural-selection-top');
        rootElement.style.removeProperty('--structural-selection-height');
        return;
      }

      const startElement = editor.getElementByKey(range.visualStartKey);
      const endElement = editor.getElementByKey(range.visualEndKey);
      if (!startElement || !endElement) {
        rootElement.style.removeProperty('--structural-selection-top');
        rootElement.style.removeProperty('--structural-selection-height');
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

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      renderStructuralHighlight(null, false, previousRootElement ?? undefined);
      renderStructuralHighlight(null, editor.selection.isStructural(), rootElement ?? undefined);
    });

    const unregisterProgressionListener = editor.registerUpdateListener(({ editorState, tags }) => {
      const { payload, hasStructuralSelection, structuralRange, outlineSelection, progression, unlock } =
        editorState.read(() =>
          $computeOutlineSelectionSnapshot({
            selection: $getSelection(),
            isProgressiveTagged: tags.has(PROGRESSIVE_SELECTION_TAG),
            isSnapTagged: tags.has(SNAP_SELECTION_TAG),
            progression: progressionRef.current,
            unlock: unlockRef.current,
            initialProgression: INITIAL_PROGRESSIVE_STATE,
          })
        );

      progressionRef.current = progression;
      unlockRef.current = unlock;

      const hasHighlight = hasStructuralSelection && structuralRange !== null;
      renderStructuralHighlight(structuralRange, hasHighlight);
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

      progressionRef.current = {
        anchorKey: planResult.anchorKey,
        stage: getStoredStage(planResult),
        locked: true,
      };
    };

    const $collapseStructuralSelectionToCaretAndReset = (
      edge: 'start' | 'end' | 'anchor' = 'anchor'
    ): boolean => {
      const outlineSelection = editor.selection.get();
      const range = outlineSelection?.range ?? null;
      const hasStructuralSelection = outlineSelection?.kind === 'structural';
      const hasCollapsibleSelection = editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && (!selection.isCollapsed() || hasStructuralSelection);
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

      return true;
    };

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event: KeyboardEvent | null) => {
        const planResult = editor
          .getEditorState()
          .read(() => $computeProgressivePlan(progressionRef, INITIAL_PROGRESSIVE_STATE));

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

      const planResult = $computeDirectionalPlan(progressionRef, direction, INITIAL_PROGRESSIVE_STATE);
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

    const unregisterCollapseCommand = editor.registerCommand(
      COLLAPSE_STRUCTURAL_SELECTION_COMMAND,
      ({ edge }) => $collapseStructuralSelectionToCaretAndReset(edge ?? 'anchor'),
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      disposedRef.current = true;
      renderStructuralHighlight(null, false);
      unregisterProgressionListener();
      unregisterSelectAll();
      unregisterArrowLeft();
      unregisterArrowRight();
      unregisterDirectionalCommand();
      unregisterCollapseCommand();
      unregisterRootListener();
    };
  }, [editor]);

  return null;
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
