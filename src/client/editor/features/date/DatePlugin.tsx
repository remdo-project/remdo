import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import dayjs from 'dayjs';
import {
  $createNodeSelection,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import type { LexicalNode } from 'lexical';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { $createDateNode, $isDateNode } from './date-node';
import type { DateNode } from './date-node';
import {
  resolveDatePickerElementAnchor,
  resolveDatePickerSelectionAnchor,
} from './anchor';
import { DatePickerPopover } from './DatePickerPopover';
import { $resolveDateQuerySession } from './session';
import type { ActiveDateQuery, DatePickerState, DateQuerySession } from './types';
import './date.css';

type DateTokenSelectionSide = 'after' | 'before';

interface SelectedDateToken {
  node: DateNode;
  side: DateTokenSelectionSide;
}

const DATE_TOKEN_SELECTED_ATTR = 'data-date-token-selected';

function isTypingTrigger(event: KeyboardEvent): boolean {
  if (event.key !== '!' || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  return !event.isComposing;
}

function isPlainKeyboardEvent(event: KeyboardEvent | null): boolean {
  return !event || !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
}

function completeKeyboardCommand(event: KeyboardEvent | null): true {
  event?.preventDefault();
  event?.stopPropagation();
  return true;
}

function getTodayIsoDate(): string {
  return dayjs().format('YYYY-MM-DD');
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
    return;
  }

  const offset = side === 'before' ? 0 : node.getTextContentSize();
  node.select(offset, offset);
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

  if ($isDateNode(anchorNode)) {
    if (direction === 'before' && anchor.offset === 0) {
      return null;
    }

    if (direction === 'after' && anchor.offset === anchorNode.getTextContentSize()) {
      return null;
    }

    return {
      node: anchorNode,
      side: direction === 'before' ? 'after' : 'before',
    };
  }

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

function $resolveInnerDateTokenSelection(): SelectedDateToken | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  if (!$isDateNode(anchorNode)) {
    return null;
  }

  const textSize = anchorNode.getTextContentSize();
  if (anchor.offset <= 0 || anchor.offset >= textSize) {
    return null;
  }

  return {
    node: anchorNode,
    side: anchor.offset < textSize / 2 ? 'before' : 'after',
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
  const sessionRef = useRef<DateQuerySession | null>(null);
  const pendingTriggerRef = useRef(false);
  const selectedDateNodeKeyRef = useRef<string | null>(null);
  const selectedDateTokenSideRef = useRef<DateTokenSelectionSide>('after');

  const setPickerState = useCallback((next: DatePickerState | null) => {
    pickerRef.current = next;
    setPicker(next);
  }, []);

  const closePicker = useCallback(() => {
    sessionRef.current = null;
    pendingTriggerRef.current = false;
    setPickerState(null);
  }, [setPickerState]);

  const syncSelectedDateTokenDOM = useCallback(() => {
    const selectedNodeKey = editor.getEditorState().read(() => $getSingleSelectedDateNode()?.getKey() ?? null);
    const previousNodeKey = selectedDateNodeKeyRef.current;
    if (previousNodeKey && previousNodeKey !== selectedNodeKey) {
      editor.getElementByKey(previousNodeKey)?.removeAttribute(DATE_TOKEN_SELECTED_ATTR);
    }
    if (selectedNodeKey) {
      editor.getElementByKey(selectedNodeKey)?.setAttribute(DATE_TOKEN_SELECTED_ATTR, 'true');
    }
    selectedDateNodeKeyRef.current = selectedNodeKey;
  }, [editor]);

  const clearSelectedDateTokenDOM = useCallback(() => {
    const selectedNodeKey = selectedDateNodeKeyRef.current;
    if (selectedNodeKey) {
      editor.getElementByKey(selectedNodeKey)?.removeAttribute(DATE_TOKEN_SELECTED_ATTR);
      selectedDateNodeKeyRef.current = null;
    }
  }, [editor]);

  const syncPickerFromSelection = useCallback(() => {
    const nextState = editor.getEditorState().read((): {
      kind: 'update';
    } | { kind: 'keep' } | { kind: 'close' } => {
      if (pickerRef.current?.kind === 'edit') {
        return { kind: 'keep' };
      }

      if (editor.selection.isStructural()) {
        return { kind: 'close' };
      }

      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return sessionRef.current ? { kind: 'keep' } : { kind: 'close' };
      }

      const anchorNode = selection.anchor.getNode();
      if (!$isTextNode(anchorNode)) {
        return sessionRef.current ? { kind: 'keep' } : { kind: 'close' };
      }

      const caretOffset = selection.anchor.offset;
      const pendingTrigger = pendingTriggerRef.current;
      pendingTriggerRef.current = false;

      const currentSession = sessionRef.current;
      if (!pendingTrigger && !currentSession) {
        return { kind: 'close' };
      }

      const seededSession = pendingTrigger
        ? {
            textNodeKey: anchorNode.getKey(),
            triggerOffset: caretOffset - 1,
          }
        : currentSession;

      const resolved = $resolveDateQuerySession(anchorNode, caretOffset, seededSession);
      if (!resolved) {
        sessionRef.current = null;
        return { kind: 'close' };
      }

      if (resolved.query.length > 0) {
        sessionRef.current = null;
        return { kind: 'close' };
      }

      sessionRef.current = resolved.session;
      return { kind: 'update' };
    });

    if (nextState.kind === 'close') {
      closePicker();
      return;
    }

    if (nextState.kind === 'keep') {
      return;
    }

    const anchor = resolveDatePickerSelectionAnchor(editor);
    if (!anchor) {
      closePicker();
      return;
    }

    setPickerState({
      anchor,
      isoDate: pickerRef.current?.isoDate ?? getTodayIsoDate(),
      kind: 'insert',
    });
  }, [closePicker, editor, setPickerState]);

  const $resolveActiveQuery = useCallback((): ActiveDateQuery | null => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return null;
    }

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) {
      return null;
    }

    const currentSession = sessionRef.current;
    if (!currentSession) {
      return null;
    }

    const caretOffset = selection.anchor.offset;
    const resolved = $resolveDateQuerySession(anchorNode, caretOffset, currentSession);
    if (!resolved) {
      sessionRef.current = null;
      return null;
    }

    sessionRef.current = resolved.session;
    return {
      triggerNode: resolved.triggerNode,
      anchorNode,
      caretOffset,
      query: resolved.query,
    };
  }, []);

  const $deleteActiveQueryToken = useCallback((): boolean => {
    const activeQuery = $resolveActiveQuery();
    if (!activeQuery || !sessionRef.current) {
      return false;
    }

    const range = $createRangeSelection();
    range.setTextNodeRange(
      activeQuery.triggerNode,
      sessionRef.current.triggerOffset,
      activeQuery.anchorNode,
      activeQuery.caretOffset
    );
    $setSelection(range);
    range.insertText('');

    closePicker();
    return true;
  }, [$resolveActiveQuery, closePicker]);

  const $confirmDate = useCallback((isoDate: string): boolean => {
    const currentPicker = pickerRef.current;
    if (!currentPicker) {
      return false;
    }

    if (currentPicker.kind === 'edit') {
      const node = $getNodeByKey(currentPicker.nodeKey);
      if ($isDateNode(node)) {
        node.setIsoDate(isoDate);
      }
      closePicker();
      return true;
    }

    const activeQuery = $resolveActiveQuery();
    if (!activeQuery || !sessionRef.current) {
      return false;
    }

    const range = $createRangeSelection();
    range.setTextNodeRange(
      activeQuery.triggerNode,
      sessionRef.current.triggerOffset,
      activeQuery.anchorNode,
      activeQuery.caretOffset
    );
    $setSelection(range);
    range.insertNodes([$createDateNode(isoDate), $createTextNode(' ')]);

    closePicker();
    return true;
  }, [$resolveActiveQuery, closePicker]);

  const handlePickerMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handlePickerChange = useCallback(
    (isoDate: string | null) => {
      if (!isoDate) {
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

      sessionRef.current = null;
      pendingTriggerRef.current = false;
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

  const $normalizeInnerDateTokenSelection = useCallback((): boolean => {
    const resolved = $resolveInnerDateTokenSelection();
    if (!resolved) {
      return false;
    }

    selectedDateTokenSideRef.current = resolved.side;
    $selectDateToken(resolved.node);
    return false;
  }, []);

  useEffect(() => {
    installOutlineSelectionHelpers(editor);
    syncPickerFromSelection();
    syncSelectedDateTokenDOM();

    return mergeRegister(
      editor.registerRootListener((nextRoot, previousRoot) => {
        if (previousRoot === nextRoot) {
          return;
        }
        setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      }),
      editor.registerUpdateListener(() => {
        syncPickerFromSelection();
        syncSelectedDateTokenDOM();
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
        SELECTION_CHANGE_COMMAND,
        () => $normalizeInnerDateTokenSelection(),
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || sessionRef.current || pickerRef.current) {
            return false;
          }
          if (editor.selection.isStructural()) {
            return false;
          }
          if (!isTypingTrigger(event)) {
            return false;
          }
          pendingTriggerRef.current = true;
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          const currentPicker = pickerRef.current;
          if (!currentPicker) {
            return false;
          }
          const handled = $confirmDate(currentPicker.isoDate);
          if (!handled) {
            return false;
          }
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        },
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
        (event: KeyboardEvent | null) => {
          const currentPicker = pickerRef.current;
          if (!currentPicker) {
            return false;
          }
          const handled = $confirmDate(currentPicker.isoDate);
          if (!handled) {
            return false;
          }
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        },
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
        (event: KeyboardEvent | null) => {
          const currentPicker = pickerRef.current;
          if (!sessionRef.current || !currentPicker || currentPicker.kind !== 'insert') {
            return false;
          }
          const activeQuery = $resolveActiveQuery();
          if (!activeQuery || activeQuery.query.length > 0) {
            return false;
          }
          const handled = $deleteActiveQueryToken();
          if (!handled) {
            return false;
          }
          event?.preventDefault();
          event?.stopPropagation();
          return true;
        },
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
        clearSelectedDateTokenDOM();
      }
    );
  }, [
    closePicker,
    clearSelectedDateTokenDOM,
    $clearSelectedDateToken,
    $confirmDate,
    $deleteActiveQueryToken,
    $deleteSelectedOrAdjacentDateToken,
    $normalizeInnerDateTokenSelection,
    $openSelectedDateTokenPicker,
    $resolveActiveQuery,
    $selectAdjacentDateToken,
    editor,
    syncPickerFromSelection,
    syncSelectedDateTokenDOM,
  ]);

  useEffect(() => {
    const handleRootMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const dateElement = target.closest<HTMLElement>('[data-date-node-key]');
      if (!dateElement) {
        return;
      }

      const nodeKey = dateElement.dataset.dateNodeKey;
      if (!nodeKey) {
        return;
      }

      const tokenSide = resolvePointerDateTokenSide(dateElement, event.clientX);
      event.preventDefault();
      event.stopPropagation();
      editor.getRootElement()?.focus({ preventScroll: true });
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDateNode(node)) {
          selectedDateTokenSideRef.current = tokenSide;
          $selectDateToken(node);
        }
      });
    };

    const handleRootClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const dateElement = target.closest<HTMLElement>('[data-date-node-key]');
      if (!dateElement) {
        return;
      }

      const nodeKey = dateElement.dataset.dateNodeKey;
      if (!nodeKey) {
        return;
      }

      const tokenSide = resolvePointerDateTokenSide(dateElement, event.clientX);
      const anchor = resolveDatePickerElementAnchor(editor, dateElement);
      if (!anchor) {
        return;
      }

      const isoDate = editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey);
        return $isDateNode(node) ? node.getIsoDate() : null;
      });
      if (!isoDate) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDateNode(node)) {
          selectedDateTokenSideRef.current = tokenSide;
          $selectDateToken(node);
        }
      });
      sessionRef.current = null;
      pendingTriggerRef.current = false;
      setPickerState({
        anchor,
        isoDate,
        kind: 'edit',
        nodeKey,
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
  }, [closePicker, editor, setPickerState]);

  if (!picker || !portalRoot) {
    return null;
  }

  return (
    <DatePickerPopover
      picker={picker}
      portalRoot={portalRoot}
      onChange={handlePickerChange}
      onMouseDown={handlePickerMouseDown}
    />
  );
}
