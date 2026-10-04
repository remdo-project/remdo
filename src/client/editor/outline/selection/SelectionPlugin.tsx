import { $getListItemByKey } from '#client/editor/outline/list-structure';
import { collapseSelectionToCaret, resolveBoundaryPoint } from '#client/editor/outline/selection/caret';
import { $applyCaretEdge, setSelectionBetweenItems } from '#client/editor/outline/selection/apply';
import { COLLAPSE_STRUCTURAL_SELECTION_COMMAND, PROGRESSIVE_SELECTION_DIRECTION_COMMAND } from '#client/editor/foundation/commands';
import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { getViewRoot } from '#client/editor/outline/view-root';
import { $shouldBlockHorizontalArrow } from '#client/editor/outline/selection/navigation';
import {
  $applyProgressivePlan,
  $computeDirectionalPlan,
  $computeProgressivePlan,
  $restoreInlineSelection,
  INITIAL_PROGRESSIVE_STATE,
} from '#client/editor/outline/selection/progressive';
import type { ProgressivePlanResult } from '#client/editor/outline/selection/progressive';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $createRangeSelectionFromDom,
  $setSelection,
  $isRangeSelection,
  $addUpdateTag,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  SELECT_ALL_COMMAND,
  SELECTION_CHANGE_COMMAND,
  getDOMSelection,
} from 'lexical';
import type { RangeSelection } from 'lexical';
import { $getNoteBodyFromNode } from '#client/editor/outline/selection/body-region';
import { restoreLabelFocusVisualLine } from '#client/editor/outline/selection/visual-line';
import type { InlineSelectionOrigin } from '#client/editor/outline/selection/rungs';
import type { OutlineSelectionRange } from '#client/editor/outline/selection/model';
import type { SnapPayload } from '#client/editor/outline/selection/resolve';
import { $resolveSelectionPointItem } from '#client/editor/outline/selection/resolve';
import { $computeOutlineSelectionSnapshot } from '#client/editor/outline/selection/snapshot';
import type { StructuralReshape } from '#client/editor/outline/selection/snapshot';
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

interface DomSelectionPoints {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
}

function isSameDomSelection(a: DomSelectionPoints, b: DomSelectionPoints | null): boolean {
  return b !== null
    && a.anchorNode === b.anchorNode
    && a.anchorOffset === b.anchorOffset
    && a.focusNode === b.focusNode
    && a.focusOffset === b.focusOffset;
}

export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const ladderRef = useRef(INITIAL_PROGRESSIVE_STATE);
  const unlockRef = useRef(false);
  useEffect(() => {
    const disposedRef = { current: false };
    installOutlineSelectionHelpers(editor);

    // Preserve the ladder while Lexical normalizes a range the plan wrote.
    // Clear after that selectionchange commits, or immediately if no DOM change
    // is applied. Clearing during the event loses normalized anchors and empty rungs.
    const clearUnlock = () => {
      unlockRef.current = false;
    };
    let domSelectionBeforePlan: DomSelectionPoints | null = null;
    let restoredLabelFocus: InlineSelectionOrigin | null = null;
    let reactiveMotion: { selection: RangeSelection; focusKey: string; regionKey: string | null; direction: 'up' | 'down'; points: DomSelectionPoints } | null = null;
    let awaitingHandoff = false;
    let handoffTimer: ReturnType<typeof setTimeout> | undefined;
    const armUnlock = () => {
      clearTimeout(handoffTimer);
      awaitingHandoff = false;
      unlockRef.current = true;
    };
    const abandonPlan = () => {
      ladderRef.current = INITIAL_PROGRESSIVE_STATE;
      domSelectionBeforePlan = null;
      clearUnlock();
    };
    const ownerDocument = editor.getRootElement()?.ownerDocument ?? document;
    const readDomSelection = (): DomSelectionPoints | null => {
      const selection = editor.getRootElement()?.ownerDocument.getSelection();
      return selection
        ? { anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset, focusNode: selection.focusNode, focusOffset: selection.focusOffset }
        : null;
    };

    const endHandoff = () => {
      if (!awaitingHandoff) {
        return;
      }
      awaitingHandoff = false;
      handoffTimer = setTimeout(clearUnlock);
    };
    const clearReactiveMotion = () => { reactiveMotion = null; };
    const clearCompletedNoopMotion = (event: KeyboardEvent) => {
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && reactiveMotion
        && isSameDomSelection(reactiveMotion.points, readDomSelection())) clearReactiveMotion();
    };
    ownerDocument.addEventListener('blur', clearReactiveMotion, true);
    ownerDocument.addEventListener('keyup', clearCompletedNoopMotion, true);
    ownerDocument.addEventListener('pointerdown', clearReactiveMotion, true);
    ownerDocument.addEventListener('selectionchange', endHandoff);

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
    const makeCoalescingScheduler = <T,>(flush: (value: T) => void): ((value: T | null) => void) => {
      let pending: T | null = null;
      let scheduled = false;
      return (value: T | null) => {
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

    // One pending write lets every later snapshot supersede an older snap or
    // reshape, including a caret/inline choice that needs no follow-up write.
    const scheduleSelectionWrite = makeCoalescingScheduler<SnapPayload | StructuralReshape>(action => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        if ('kind' in action) {
          if (action.kind === 'collapse') {
            collapseSelectionToCaret(selection);
            return;
          }
          const start = $getListItemByKey(action.plan.startKey);
          const end = $getListItemByKey(action.plan.endKey);
          if (start && end) setSelectionBetweenItems(selection, start, end, 'content', 'subtree');
          return;
        }
        const anchorItem = $getListItemByKey(action.anchorKey);
        const focusItem = $getListItemByKey(action.focusKey);
        if (!anchorItem || !focusItem) return;
        const anchor = resolveBoundaryPoint(anchorItem, action.anchorEdge);
        const focus = resolveBoundaryPoint(focusItem, action.focusEdge);
        if (anchor && focus) selection.setTextNodeRange(anchor.node, anchor.offset, focus.node, focus.offset);
      }, { tag: 'kind' in action ? [PROGRESSIVE_SELECTION_TAG, SNAP_SELECTION_TAG] : SNAP_SELECTION_TAG });
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

    const $computeSnapshot = (isProgressiveTagged = false, isSnapTagged = false, treeChanged = false) =>
      $computeOutlineSelectionSnapshot({
        selection: $getSelection(), isProgressiveTagged, isSnapTagged, treeChanged,
        progression: ladderRef.current, unlock: unlockRef.current,
        initialProgression: INITIAL_PROGRESSIVE_STATE, boundaryKey: getViewRoot(editor),
      });
    const publishSnapshot = ({ payload, hasStructuralSelection, structuralRange, outlineSelection, progression, unlock, reshape }: ReturnType<typeof $computeSnapshot>) => {
      ladderRef.current = progression;
      unlockRef.current = unlock;
      renderStructuralHighlight(structuralRange, hasStructuralSelection && structuralRange !== null);
      editor.selection.set(outlineSelection);
      scheduleSelectionWrite(reshape ?? payload);
    };

    const unregisterProgressionListener = editor.registerUpdateListener(({ editorState, tags, dirtyElements, dirtyLeaves }) => {
      // The tree changed (collaboration, undo/redo, typing) when this update
      // touched any node — as opposed to a selection-only change such as a
      // Shift+Click extension. Only a tree change re-replays the ladder.
      const treeChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0;
      if (tags.has(PROGRESSIVE_SELECTION_TAG) && restoredLabelFocus) {
        const origin = restoredLabelFocus;
        restoredLabelFocus = null;
        const unchanged = editorState.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) && (['anchor', 'focus'] as const).every(endpoint =>
            selection[endpoint].key === origin[endpoint].key && selection[endpoint].offset === origin[endpoint].offset
            && selection[endpoint].type === origin[endpoint].type);
        });
        if (unchanged) restoreLabelFocusVisualLine(editor, origin.focusAtLineEnd!);
      }
      if (tags.has(PROGRESSIVE_SELECTION_TAG) && domSelectionBeforePlan) {
        const unchanged = isSameDomSelection(domSelectionBeforePlan, readDomSelection());
        domSelectionBeforePlan = null;
        if (unchanged) {
          clearUnlock();
        } else {
          awaitingHandoff = true;
        }
      }
      publishSnapshot(editorState.read(() => $computeSnapshot(tags.has(PROGRESSIVE_SELECTION_TAG), tags.has(SNAP_SELECTION_TAG), treeChanged)));
    });

    const $beginPlan = () => {
      armUnlock();
      domSelectionBeforePlan = readDomSelection();
      $addUpdateTags([SNAP_SELECTION_TAG, PROGRESSIVE_SELECTION_TAG]);
    };

    const $applyPlan = (planResult: ProgressivePlanResult) => {
      // The ladder ref was already advanced by $computeProgressivePlan; here we
      // only apply the plan and roll the ladder back if the selection fails.
      $beginPlan();

      if (!$applyProgressivePlan(planResult)) {
        abandonPlan();
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
          unlockRef.current = false;
        }
      }

      return true;
    };

    const $collapseOnKey = (edge: 'start' | 'end' | 'anchor', event: KeyboardEvent): boolean => {
      if (edge !== 'anchor' && (!editor.selection.isStructural()
        || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)) return false;
      if (!$collapseStructuralSelectionToCaretAndReset(edge)) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    };

    const unregisterSelectAll = editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event) => {
        const viewRootKey = getViewRoot(editor);
        const planResult = editor
          .getEditorState()
          .read(() => $computeProgressivePlan(ladderRef, INITIAL_PROGRESSIVE_STATE, viewRootKey));

        if (!planResult) {
          return false;
        }

        event.preventDefault();
        $applyPlan(planResult);

        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterHorizontalArrows = (['left', 'right'] as const).map(direction => editor.registerCommand(
      direction === 'left' ? KEY_ARROW_LEFT_COMMAND : KEY_ARROW_RIGHT_COMMAND,
      event => {
        if (!event.shiftKey) return $collapseOnKey(direction === 'left' ? 'start' : 'end', event);
        if (!$shouldBlockHorizontalArrow(direction)) return false;
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        return true;
      }, COMMAND_PRIORITY_CRITICAL
    ));

    const $runDirectionalPlan = (direction: 'up' | 'down'): void => {
      const viewRootKey = getViewRoot(editor);

      // $computeDirectionalPlan owns the ladder ref: it pushes/pops the ladder
      // and returns either a plan, a collapse signal (popped to caret), a no-op
      // (stop-at-anchor / boundary), or null on an unresolvable selection.
      const result = $computeDirectionalPlan(ladderRef, direction, INITIAL_PROGRESSIVE_STATE, viewRootKey);

      if (!result) {
        abandonPlan();
        return;
      }

      if ('noop' in result) {
        clearUnlock();
        return;
      }

      if ('plan' in result) {
        $applyPlan(result);
        return;
      }
      $beginPlan();
      if ('restore' in result) {
        if (!$restoreInlineSelection(result)) {
          abandonPlan();
        } else {
          restoredLabelFocus = result.restore;
        }
        return;
      }
      if ('collapse' in result) {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          collapseSelectionToCaret(selection);
        } else {
          abandonPlan();
        }
      }
    };

    const $finishReactiveMotion = (selection: RangeSelection | null): void => {
      const points = readDomSelection();
      if (!reactiveMotion || !points || isSameDomSelection(points, reactiveMotion.points)) return;
      const checkpoint = reactiveMotion;
      reactiveMotion = null;
      if (!selection) return;
      // Native extension keeps its anchor region; inline boundaries can alias DOM points.
      const anchor = $resolveSelectionPointItem(selection, selection.anchor);
      const anchorRegion = $getNoteBodyFromNode(selection.anchor.getNode())?.getKey() ?? null;
      if (anchor?.getKey() !== checkpoint.focusKey || anchorRegion !== checkpoint.regionKey) return;
      const focus = $resolveSelectionPointItem(selection, selection.focus);
      const regionKey = $getNoteBodyFromNode(selection.focus.getNode())?.getKey() ?? null;
      if (!focus || (focus.getKey() === checkpoint.focusKey && regionKey === checkpoint.regionKey)) return;
      if (!$restoreInlineSelection({ restore: checkpoint.selection, anchorKey: checkpoint.focusKey })) return;
      const viewRootKey = getViewRoot(editor);
      if (focus.getKey() === viewRootKey || checkpoint.focusKey === viewRootKey) {
        $beginPlan();
        restoredLabelFocus = {
          anchor: checkpoint.selection.anchor,
          focus: checkpoint.selection.focus,
          focusAtLineEnd: checkpoint.direction === 'up',
        };
      } else {
        $runDirectionalPlan(checkpoint.direction);
        if (ladderRef.current.entrySelection) {
          ladderRef.current.entrySelection.focusAtLineEnd = checkpoint.direction === 'up';
        }
      }
      publishSnapshot($computeSnapshot(true, true));
    };

    // A second key can arrive before the native selectionchange. Import that
    // completed motion before command consumers read the selection in this update.
    const unregisterPendingMotion = editor.registerCommand(KEY_DOWN_COMMAND, event => {
      if (!reactiveMotion) return false;
      const native = $createRangeSelectionFromDom(getDOMSelection(editor._window), editor);
      if (native) $setSelection(native);
      $finishReactiveMotion(native);
      if (event.key !== 'Shift' && !(event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
        && (event.key === 'ArrowUp' || event.key === 'ArrowDown'))) clearReactiveMotion();
      return false;
    }, COMMAND_PRIORITY_CRITICAL);

    const unregisterArrows = (['up', 'down'] as const).map(direction => editor.registerCommand<KeyboardEvent>(
      direction === 'up' ? KEY_ARROW_UP_COMMAND : KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!event.shiftKey) return $collapseOnKey(direction === 'up' ? 'start' : 'end', event);
        if (event.altKey || event.metaKey || event.ctrlKey) return false;
        const selection = $getSelection();
        if ($isRangeSelection(selection) && ladderRef.current.stack.length === 0 && !editor.selection.isStructural()) {
          const checkpoint = $createRangeSelectionFromDom(getDOMSelection(editor._window), editor) ?? selection.clone();
          const focus = $resolveSelectionPointItem(checkpoint, checkpoint.focus);
          const points = readDomSelection();
          if (focus && points) {
            reactiveMotion = { selection: checkpoint, focusKey: focus.getKey(), regionKey: $getNoteBodyFromNode(checkpoint.focus.getNode())?.getKey() ?? null, direction, points };
            return false;
          }
        }
        $runDirectionalPlan(direction);
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    ));

    const unregisterReactiveSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        $finishReactiveMotion($isRangeSelection(selection) ? selection : null);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

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

    const unregisterCollapseNavigation = editor.registerCommand(
      KEY_DOWN_COMMAND,
      event => {
        if (event.key !== 'Home' && event.key !== 'End' && event.key !== 'PageUp' && event.key !== 'PageDown') {
          return false;
        }
        return $collapseOnKey(event.key === 'Home' || event.key === 'PageUp' ? 'start' : 'end', event);
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      event => $collapseOnKey('anchor', event),
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      disposedRef.current = true;
      reactiveMotion = null;
      ownerDocument.removeEventListener('selectionchange', endHandoff);
      ownerDocument.removeEventListener('blur', clearReactiveMotion, true);
      ownerDocument.removeEventListener('keyup', clearCompletedNoopMotion, true);
      ownerDocument.removeEventListener('pointerdown', clearReactiveMotion, true);
      clearTimeout(handoffTimer);
      renderStructuralHighlight(null, false);
      unregisterProgressionListener();
      unregisterSelectAll();
      for (const unregister of unregisterHorizontalArrows) unregister();
      for (const unregister of unregisterArrows) unregister();
      unregisterPendingMotion();
      unregisterReactiveSelection();
      unregisterDirectionalCommand();
      unregisterCollapseCommand();
      unregisterCollapseNavigation();
      unregisterEscape();
      unregisterRootListener();
    };
  }, [editor]);

  return null;
}
