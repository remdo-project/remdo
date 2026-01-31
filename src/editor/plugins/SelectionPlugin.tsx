import type { ListItemNode } from '@lexical/list';
import { $isListNode } from '@lexical/list';
import { collapseSelectionToCaret, resolveBoundaryPoint } from '@/editor/outline/selection/caret';
import { $applyCaretEdge } from '@/editor/outline/selection/apply';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND, PROGRESSIVE_SELECTION_DIRECTION_COMMAND } from '@/editor/commands';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { $shouldBlockHorizontalArrow } from '@/editor/outline/selection/navigation';
import {
  $applyProgressivePlan,
  $computeDirectionalPlan,
  $computeProgressivePlan,
  $isDirectionalBoundary,
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
} from 'lexical';
import type { OutlineSelectionRange } from '@/editor/outline/selection/model';
import type { ProgressiveSelectionState, SnapPayload } from '@/editor/outline/selection/resolve';
import { $computeOutlineSelectionSnapshot } from '@/editor/outline/selection/snapshot';
import type { ProgressiveUnlockState } from '@/editor/outline/selection/snapshot';
import type { StructuralOverlayConfig } from '@/editor/outline/selection/overlay';
import { clearStructuralOverlay, updateStructuralOverlay } from '@/editor/outline/selection/overlay';
import { useEffect, useRef } from 'react';
import { getContentListItem } from '@/editor/outline/list-structure';
import { getContiguousSelectionHeads } from '@/editor/outline/selection/heads';
import { getParentContentItem } from '@/editor/outline/selection/tree';

const PROGRESSIVE_SELECTION_TAG = 'selection:progressive-range';
const SNAP_SELECTION_TAG = 'selection:snap-range';
const STRUCTURAL_OVERLAY: StructuralOverlayConfig = {
  className: 'editor-input--structural',
  topVar: '--structural-selection-top',
  heightVar: '--structural-selection-height',
};

function getStoredStage(result: ProgressivePlanResult): number {
  if (result.repeatStage && result.stage > 0) {
    return result.stage - 1;
  }
  return result.stage;
}

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

    const $inferSelectionDirection = (
      anchorKey: string,
      fallback: ProgressiveSelectionState['lastDirection']
    ): ProgressiveSelectionState['lastDirection'] => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return fallback ?? null;
      }

      const heads = getContiguousSelectionHeads(selection);
      if (heads.length <= 1) {
        return fallback ?? null;
      }

      const anchorNode = $getNodeByKey<ListItemNode>(anchorKey);
      if (!anchorNode) {
        return fallback ?? null;
      }

      const anchorContent = getContentListItem(anchorNode);
      const parentList = heads[0]!.getParent();
      if (!$isListNode(parentList)) {
        return fallback ?? null;
      }

      let current: ListItemNode | null = anchorContent;
      while (current && current.getParent() !== parentList) {
        current = getParentContentItem(current);
      }

      if (!current) {
        return fallback ?? null;
      }

      const index = heads.findIndex((head) => head.getKey() === current.getKey());
      if (index === -1) {
        return fallback ?? 'down';
      }

      if (index === 0) {
        return 'down';
      }

      if (index === heads.length - 1) {
        return 'up';
      }

      return fallback ?? 'down';
    };

    const renderStructuralHighlight = (
      range: OutlineSelectionRange | null,
      isActive: boolean,
      rootElement = editor.getRootElement()
    ) => {
      updateStructuralOverlay(editor, range, isActive, STRUCTURAL_OVERLAY, rootElement);
    };

    const unregisterRootListener = editor.registerRootListener((rootElement, previousRootElement) => {
      clearStructuralOverlay(previousRootElement ?? null, STRUCTURAL_OVERLAY);
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

      const nextDirection =
        planResult.stage >= 3
          ? $inferSelectionDirection(planResult.anchorKey, progressionRef.current.lastDirection)
          : null;

      progressionRef.current = {
        anchorKey: planResult.anchorKey,
        stage: getStoredStage(planResult),
        locked: true,
        lastDirection: nextDirection,
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
      const isBoundary = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        if (!editor.selection.isStructural()) {
          return false;
        }
        return $isDirectionalBoundary(selection, direction);
      });

      if (isBoundary) {
        return;
      }

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

      const lastDirection = planResult.isShrink ? progressionRef.current.lastDirection : direction;

      progressionRef.current = {
        anchorKey: planResult.anchorKey,
        stage: getStoredStage(planResult),
        locked: true,
        lastDirection,
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
