import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import dayjs from 'dayjs';
import {
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { $createDateNode, $isDateNode } from './date-node';
import {
  resolveDatePickerElementAnchor,
  resolveDatePickerSelectionAnchor,
} from './anchor';
import { DatePickerPopover } from './DatePickerPopover';
import { $resolveDateQuerySession } from './session';
import type { ActiveDateQuery, DatePickerState, DateQuerySession } from './types';

function isTypingTrigger(event: KeyboardEvent): boolean {
  if (event.key !== '!' || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  return !event.isComposing;
}

function getTodayIsoDate(): string {
  return dayjs().format('YYYY-MM-DD');
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

  const setPickerState = useCallback((next: DatePickerState | null) => {
    pickerRef.current = next;
    setPicker(next);
  }, []);

  const closePicker = useCallback(() => {
    sessionRef.current = null;
    pendingTriggerRef.current = false;
    setPickerState(null);
  }, [setPickerState]);

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

  useEffect(() => {
    installOutlineSelectionHelpers(editor);
    syncPickerFromSelection();

    return mergeRegister(
      editor.registerRootListener((nextRoot, previousRoot) => {
        if (previousRoot === nextRoot) {
          return;
        }
        setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      }),
      editor.registerUpdateListener(() => {
        syncPickerFromSelection();
      }),
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
      () => {
        closePicker();
      }
    );
  }, [closePicker, $confirmDate, $deleteActiveQueryToken, $resolveActiveQuery, editor, syncPickerFromSelection]);

  useEffect(() => {
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
    root?.addEventListener('click', handleRootClick, true);
    const unregisterRootListener = editor.registerRootListener((nextRoot, previousRoot) => {
      if (previousRoot === nextRoot) {
        return;
      }
      previousRoot?.removeEventListener('click', handleRootClick, true);
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
