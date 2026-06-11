import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import type { LexicalNode } from 'lexical';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { $isDateNode } from './date-node';
import type { DateNode } from './date-node';
import { resolveDatePickerElementAnchor } from './anchor';
import { DatePickerPopover } from './DatePickerPopover';
import { DateTypeaheadPlugin } from './DateTypeaheadPlugin';
import type { DatePickerState } from './types';
import './date.css';

type DateTokenSelectionSide = 'after' | 'before';

interface SelectedDateToken {
  node: DateNode;
  side: DateTokenSelectionSide;
}

interface DatePointerTarget {
  element: HTMLElement;
  nodeKey: string;
  side: DateTokenSelectionSide;
}

function isPlainKeyboardEvent(event: KeyboardEvent | null): boolean {
  return !event || !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
}

function completeKeyboardCommand(event: KeyboardEvent | null): true {
  event?.preventDefault();
  event?.stopPropagation();
  return true;
}

function $getElementChildAt(parent: LexicalNode, index: number): LexicalNode | null {
  return $isElementNode(parent) ? parent.getChildAtIndex(index) : null;
}

function $getSingleSelectedDateNode(): DateNode | null {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) {
    return null;
  }

  const nodes = selection.getNodes();
  if (nodes.length !== 1) {
    return null;
  }

  const node = nodes[0];
  return $isDateNode(node) ? node : null;
}

function $selectDateToken(node: DateNode): void {
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
}

function $collapseDateTokenSelection(node: DateNode, side: DateTokenSelectionSide): void {
  const parent = node.getParent();
  if (parent) {
    const index = node.getIndexWithinParent();
    const offset = side === 'before' ? index : index + 1;
    parent.select(offset, offset);
  }
}

function $removeSelectedDateToken(node: DateNode): void {
  const parent = node.getParent();
  if (parent) {
    const index = node.getIndexWithinParent();
    parent.select(index, index);
  }
  node.remove();
}

function $resolveAdjacentDateToken(
  direction: DateTokenSelectionSide
): SelectedDateToken | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();

  if (anchor.type === 'element') {
    const offset = anchor.offset;
    const candidate =
      direction === 'before'
        ? $getElementChildAt(anchorNode, offset - 1)
        : $getElementChildAt(anchorNode, offset);
    return $isDateNode(candidate)
      ? {
          node: candidate,
          side: direction === 'before' ? 'after' : 'before',
        }
      : null;
  }

  if (!$isTextNode(anchorNode)) {
    return null;
  }

  if (direction === 'before' && anchorNode.getTextContent().slice(0, anchor.offset).trim() === '') {
    const previousSibling = anchorNode.getPreviousSibling();
    return $isDateNode(previousSibling) ? { node: previousSibling, side: 'after' } : null;
  }

  if (direction === 'after' && anchorNode.getTextContent().slice(anchor.offset).trim() === '') {
    const nextSibling = anchorNode.getNextSibling();
    return $isDateNode(nextSibling) ? { node: nextSibling, side: 'before' } : null;
  }

  return null;
}

function resolvePointerDateTokenSide(
  element: HTMLElement,
  clientX: number
): DateTokenSelectionSide {
  const bounds = element.getBoundingClientRect();
  return clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
}

function resolveDatePointerTarget(event: MouseEvent): DatePointerTarget | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest<HTMLElement>('[data-date-node-key]');
  const nodeKey = element?.dataset.dateNodeKey;
  if (!element || !nodeKey) {
    return null;
  }

  return {
    element,
    nodeKey,
    side: resolvePointerDateTokenSide(element, event.clientX),
  };
}

export function DatePlugin() {
  const [editor] = useLexicalComposerContext();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() => {
    const root = editor.getRootElement();
    return root ? root.closest<HTMLElement>('.editor-container') : null;
  });
  const [picker, setPicker] = useState<DatePickerState | null>(null);

  const pickerRef = useRef<DatePickerState | null>(null);
  const selectedDateTokenSideRef = useRef<DateTokenSelectionSide>('after');

  const setPickerState = useCallback((next: DatePickerState | null) => {
    pickerRef.current = next;
    setPicker(next);
  }, []);

  const closePicker = useCallback(() => {
    setPickerState(null);
  }, [setPickerState]);

  const $confirmDate = useCallback((isoDate: string): boolean => {
    const currentPicker = pickerRef.current;
    if (!currentPicker) {
      return false;
    }

    const node = $getNodeByKey(currentPicker.nodeKey);
    if ($isDateNode(node)) {
      node.setIsoDate(isoDate);
    }

    closePicker();
    return true;
  }, [closePicker]);

  const $confirmCurrentPicker = useCallback((event: KeyboardEvent | null): boolean => {
    const currentPicker = pickerRef.current;
    if (!currentPicker || !$confirmDate(currentPicker.isoDate)) {
      return false;
    }
    return completeKeyboardCommand(event);
  }, [$confirmDate]);

  const $selectDateTokenByKey = useCallback((nodeKey: string, side: DateTokenSelectionSide): DateNode | null => {
    const node = $getNodeByKey(nodeKey);
    if (!$isDateNode(node)) {
      return null;
    }

    selectedDateTokenSideRef.current = side;
    $selectDateToken(node);
    return node;
  }, []);

  const handlePickerMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handlePickerChange = useCallback(
    (isoDate: string | null) => {
      if (isoDate === null) {
        return;
      }

      editor.update(() => {
        $confirmDate(isoDate);
      });
    },
    [$confirmDate, editor]
  );

  const $selectAdjacentDateToken = useCallback(
    (direction: DateTokenSelectionSide, event: KeyboardEvent | null): boolean => {
      if (!isPlainKeyboardEvent(event) || pickerRef.current) {
        return false;
      }

      const selectedDateNode = $getSingleSelectedDateNode();
      if (selectedDateNode) {
        const side = direction === 'before' ? 'before' : 'after';
        selectedDateTokenSideRef.current = side;
        $collapseDateTokenSelection(selectedDateNode, side);
        return completeKeyboardCommand(event);
      }

      const resolved = $resolveAdjacentDateToken(direction);
      if (!resolved) {
        return false;
      }

      selectedDateTokenSideRef.current = resolved.side;
      $selectDateToken(resolved.node);
      return completeKeyboardCommand(event);
    },
    []
  );

  const $deleteSelectedOrAdjacentDateToken = useCallback(
    (direction: DateTokenSelectionSide, event: KeyboardEvent | null): boolean => {
      if (!isPlainKeyboardEvent(event)) {
        return false;
      }

      const currentPicker = pickerRef.current;
      const selectedDateNode = $getSingleSelectedDateNode();
      if (currentPicker?.kind === 'edit') {
        if (
          selectedDateNode?.getKey() === currentPicker.nodeKey ||
          $isDateNode($getNodeByKey(currentPicker.nodeKey))
        ) {
          return completeKeyboardCommand(event);
        }
        return false;
      }

      if (currentPicker) {
        return false;
      }

      if (selectedDateNode) {
        $removeSelectedDateToken(selectedDateNode);
        return completeKeyboardCommand(event);
      }

      const resolved = $resolveAdjacentDateToken(direction);
      if (!resolved) {
        return false;
      }

      selectedDateTokenSideRef.current = resolved.side;
      $selectDateToken(resolved.node);
      return completeKeyboardCommand(event);
    },
    []
  );

  const $openSelectedDateTokenPicker = useCallback(
    (event: KeyboardEvent | null): boolean => {
      if (!isPlainKeyboardEvent(event) || pickerRef.current) {
        return false;
      }

      const selectedDateNode = $getSingleSelectedDateNode();
      if (!selectedDateNode) {
        return false;
      }

      const nodeKey = selectedDateNode.getKey();
      const element = editor.getElementByKey(nodeKey);
      if (!element) {
        return false;
      }

      const anchor = resolveDatePickerElementAnchor(editor, element);
      if (!anchor) {
        return false;
      }

      setPickerState({
        anchor,
        isoDate: selectedDateNode.getIsoDate(),
        kind: 'edit',
        nodeKey,
      });
      return completeKeyboardCommand(event);
    },
    [editor, setPickerState]
  );

  const $clearSelectedDateToken = useCallback((event: KeyboardEvent | null): boolean => {
    if (!isPlainKeyboardEvent(event) || pickerRef.current) {
      return false;
    }

    const selectedDateNode = $getSingleSelectedDateNode();
    if (!selectedDateNode) {
      return false;
    }

    $collapseDateTokenSelection(selectedDateNode, selectedDateTokenSideRef.current);
    return completeKeyboardCommand(event);
  }, []);

  useEffect(() => {
    installOutlineSelectionHelpers(editor);

    return mergeRegister(
      editor.registerRootListener((nextRoot, previousRoot) => {
        if (previousRoot === nextRoot) {
          return;
        }
        setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      }),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event: KeyboardEvent | null) => $selectAdjacentDateToken('before', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event: KeyboardEvent | null) => $selectAdjacentDateToken('after', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => $confirmCurrentPicker(event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => $openSelectedDateTokenPicker(event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_SPACE_COMMAND,
        (event: KeyboardEvent | null) => $openSelectedDateTokenPicker(event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event: KeyboardEvent | null) => $confirmCurrentPicker(event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!pickerRef.current) {
            return false;
          }

          closePicker();
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event: KeyboardEvent | null) => $clearSelectedDateToken(event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event: KeyboardEvent | null) => $deleteSelectedOrAdjacentDateToken('before', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event: KeyboardEvent | null) => $deleteSelectedOrAdjacentDateToken('after', event),
        COMMAND_PRIORITY_CRITICAL
      ),
      () => {
        closePicker();
      }
    );
  }, [
    closePicker,
    $clearSelectedDateToken,
    $confirmDate,
    $confirmCurrentPicker,
    $deleteSelectedOrAdjacentDateToken,
    $openSelectedDateTokenPicker,
    $selectAdjacentDateToken,
    editor,
  ]);

  useEffect(() => {
    const handleRootMouseDown = (event: MouseEvent) => {
      const target = resolveDatePointerTarget(event);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      editor.getRootElement()?.focus({ preventScroll: true });
      editor.update(() => {
        $selectDateTokenByKey(target.nodeKey, target.side);
      });
    };

    const handleRootClick = (event: MouseEvent) => {
      const target = resolveDatePointerTarget(event);
      if (!target) {
        return;
      }

      const anchor = resolveDatePickerElementAnchor(editor, target.element);
      if (!anchor) {
        return;
      }

      const isoDate = editor.getEditorState().read(() => {
        const node = $getNodeByKey(target.nodeKey);
        return $isDateNode(node) ? node.getIsoDate() : null;
      });
      if (!isoDate) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      editor.update(() => {
        $selectDateTokenByKey(target.nodeKey, target.side);
      });
      setPickerState({
        anchor,
        isoDate,
        kind: 'edit',
        nodeKey: target.nodeKey,
      });
    };

    let root = editor.getRootElement();
    root?.addEventListener('mousedown', handleRootMouseDown, true);
    root?.addEventListener('click', handleRootClick, true);
    const unregisterRootListener = editor.registerRootListener((nextRoot, previousRoot) => {
      if (previousRoot === nextRoot) {
        return;
      }
      previousRoot?.removeEventListener('mousedown', handleRootMouseDown, true);
      previousRoot?.removeEventListener('click', handleRootClick, true);
      // eslint-disable-next-line react-web-api/no-leaked-event-listener -- removed on the next root change and in effect cleanup.
      nextRoot?.addEventListener('mousedown', handleRootMouseDown, true);
      // eslint-disable-next-line react-web-api/no-leaked-event-listener -- removed on the next root change and in effect cleanup.
      nextRoot?.addEventListener('click', handleRootClick, true);
      root = nextRoot;
    });

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!pickerRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const targetElement = target instanceof Element ? target : target.parentElement;
      if (targetElement?.closest('[data-date-picker]')) {
        return;
      }

      closePicker();
    };
    document.addEventListener('mousedown', handleDocumentMouseDown, true);

    return () => {
      unregisterRootListener();
      root?.removeEventListener('mousedown', handleRootMouseDown, true);
      root?.removeEventListener('click', handleRootClick, true);
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, [$selectDateTokenByKey, closePicker, editor, setPickerState]);

  return (
    <>
      <DateTypeaheadPlugin />
      {picker && portalRoot ? (
        <DatePickerPopover
          picker={picker}
          portalRoot={portalRoot}
          onChange={handlePickerChange}
          onMouseDown={handlePickerMouseDown}
        />
      ) : null}
    </>
  );
}
