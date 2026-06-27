import type { ListItemNode } from '@lexical/list';
import { collapseSelectionToCaret, resolveBoundaryPoint } from '#client/editor/outline/selection/caret';
import { $applyCaretEdge, setSelectionBetweenItems } from '#client/editor/outline/selection/apply';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND, PROGRESSIVE_SELECTION_DIRECTION_COMMAND } from '#client/editor/commands';
import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { getZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { $shouldBlockHorizontalArrow } from '#client/editor/outline/selection/navigation';
import {
  $applyProgressivePlan,
  $computeDirectionalPlan,
  $computeProgressivePlan,
  INITIAL_PROGRESSIVE_STATE,
} from '#client/editor/outline/selection/progressive';
import type { ProgressivePlanResult } from '#client/editor/outline/selection/progressive';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $addUpdateTag,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  SELECT_ALL_COMMAND,
} from 'lexical';
import type { OutlineSelectionRange } from '#client/editor/outline/selection/model';
import type { SnapPayload } from '#client/editor/outline/selection/resolve';
import { $computeOutlineSelectionSnapshot } from '#client/editor/outline/selection/snapshot';
import type { ProgressiveUnlockState, StructuralReshape } from '#client/editor/outline/selection/snapshot';
import type { StructuralOverlayConfig } from '#client/editor/outline/selection/overlay';
import { clearStructuralOverlay, updateStructuralOverlay } from '#client/editor/outline/selection/overlay';
import { useEffect, useRef } from 'react';

const PROGRESSIVE_SELECTION_TAG = 'selection:progressive-range';
const SNAP_SELECTION_TAG = 'selection:snap-range';
const STRUCTURAL_OVERLAY: StructuralOverlayConfig = {
  className: 'editor-input--structural',
  topVar: '--structural-selection-top',
  heightVar: '--structural-selection-height',
};

export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const ladderRef = useRef(INITIAL_PROGRESSIVE_STATE);
  const unlockRef = useRef<ProgressiveUnlockState>({ pending: false, reason: 'external' });
  useEffect(() => {
    const disposedRef = { current: false };
    installOutlineSelectionHelpers(editor);

    const $addUpdateTags = (tags: string | string[]) => {
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          $addUpdateTag(tag);
        }
      } else {
        $addUpdateTag(tags);
      }
    };

    // A coalescing microtask scheduler: repeated calls keep only the latest
    // value and run `flush` once on the next microtask, so two updates in one
    // task can't apply a stale-then-fresh selection in sequence.
    const makeCoalescingScheduler = <T,>(flush: (value: T) => void): ((value: T) => void) => {
      let pending: T | null = null;
      let scheduled = false;
      return (value: T) => {
        pending = value;
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const next = pending;
          pending = null;
          if (disposedRef.current || next === null) return;
          flush(next);
        });
      };
    };

    const scheduleSnapSelection = makeCoalescingScheduler<SnapPayload>((payload) => {
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

    // Re-apply a collaboration/undo/typing reshape to the live Lexical
    // selection. Tagged progressive + snap so the resulting update is treated
    // as our own (skips a second reshape and snap re-derivation).
    const scheduleReshapeSelection = makeCoalescingScheduler<StructuralReshape>((reshape) => {
      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          if (reshape.kind === 'collapse') {
            collapseSelectionToCaret(selection);
            return;
          }

          const startItem = $getNodeByKey<ListItemNode>(reshape.plan.startKey);
          const endItem = $getNodeByKey<ListItemNode>(reshape.plan.endKey);
          if (!startItem || !endItem) {
            return;
          }

          setSelectionBetweenItems(selection, startItem, endItem, reshape.plan.startMode, reshape.plan.endMode);
        },
        { tag: [PROGRESSIVE_SELECTION_TAG, SNAP_SELECTION_TAG] }
      );
    });

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

    const unregisterProgressionListener = editor.registerUpdateListener(({ editorState, tags, dirtyElements, dirtyLeaves }) => {
      // The tree changed (collaboration, undo/redo, typing) when this update
      // touched any node — as opposed to a selection-only change such as a
      // Shift+Click extension. Only a tree change re-replays the ladder.
      const treeChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0;
      const zoomRootKey = getZoomRoot(editor);
      const { payload, hasStructuralSelection, structuralRange, outlineSelection, progression, unlock, reshape } =
        editorState.read(() =>
          $computeOutlineSelectionSnapshot({
            selection: $getSelection(),
            isProgressiveTagged: tags.has(PROGRESSIVE_SELECTION_TAG),
            isSnapTagged: tags.has(SNAP_SELECTION_TAG),
            treeChanged,
            progression: ladderRef.current,
            unlock: unlockRef.current,
            initialProgression: INITIAL_PROGRESSIVE_STATE,
            boundaryKey: zoomRootKey,
          })
        );

      ladderRef.current = progression;
      unlockRef.current = unlock;

      const hasHighlight = hasStructuralSelection && structuralRange !== null;
      renderStructuralHighlight(structuralRange, hasHighlight);
      editor.selection.set(outlineSelection);

      // A collaboration/undo/typing update reshaped the structural ladder. The
      // snapshot already updated the outline store + highlight from the
      // re-replayed ladder; here we re-apply the reshape to the live Lexical
      // selection so the DOM range follows the remote tree change.
      if (reshape) {
        scheduleReshapeSelection(reshape);
      }

      if (!payload) {
        return;
      }

      const nextPayload = payload;

      scheduleSnapSelection(nextPayload);
    });

    const $applyPlan = (planResult: ProgressivePlanResult) => {
      // The ladder ref was already advanced by $computeProgressivePlan; here we
      // only apply the plan and roll the ladder back if the selection fails.
      $addUpdateTags([SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG]);

      const applied = $applyProgressivePlan(planResult);
      if (!applied) {
        ladderRef.current = INITIAL_PROGRESSIVE_STATE;
      }
    };

    const $collapseStructuralSelectionToCaretAndReset = (
      edge: 'start' | 'end' | 'anchor' = 'anchor'
    ): boolean => {
      const outlineSelection = editor.selection.get();
      const range = outlineSelection?.range ?? null;
      const hasStructuralSelection = outlineSelection?.kind === 'structural';
      const initialSelection = $getSelection();
      const hasCollapsibleSelection =
        $isRangeSelection(initialSelection) && (!initialSelection.isCollapsed() || hasStructuralSelection);

      if (!hasCollapsibleSelection) {
        return false;
      }

      $addUpdateTags(PROGRESSIVE_SELECTION_TAG);

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
          ladderRef.current = INITIAL_PROGRESSIVE_STATE;
          unlockRef.current = { pending: false, reason: 'external' };
        }
      }

      return true;
    };

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event: KeyboardEvent | null) => {
        const zoomRootKey = getZoomRoot(editor);
        const planResult = editor
          .getEditorState()
          .read(() => $computeProgressivePlan(ladderRef, INITIAL_PROGRESSIVE_STATE, zoomRootKey));

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
      const zoomRootKey = getZoomRoot(editor);

      unlockRef.current = { pending: true, reason: 'directional' };

      $addUpdateTags([SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG]);

      // $computeDirectionalPlan owns the ladder ref: it pushes/pops the ladder
      // and returns either a plan, a collapse signal (popped to caret), a no-op
      // (stop-at-anchor / boundary), or null on an unresolvable selection.
      const result = $computeDirectionalPlan(ladderRef, direction, INITIAL_PROGRESSIVE_STATE, zoomRootKey);

      if (!result) {
        ladderRef.current = INITIAL_PROGRESSIVE_STATE;
        return;
      }

      if ('noop' in result) {
        return;
      }

      if ('collapse' in result) {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          collapseSelectionToCaret(selection);
        }
        return;
      }

      const applied = $applyProgressivePlan(result);
      if (!applied) {
        ladderRef.current = INITIAL_PROGRESSIVE_STATE;
      }
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
