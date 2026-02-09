import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';
import { createInternalNoteLinkUrl, parseInternalNoteLinkUrl } from '@/editor/links/internal-link-url';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { useCollaborationStatus } from '@/editor/plugins/collaboration/CollaborationProvider';
import { resolveLinkPickerAnchor } from './note-link/anchor';
import { clampActiveIndex, LINK_PICKER_RESULT_LIMIT, $resolveLinkPickerOptions } from './note-link/options';
import { NoteLinkPicker } from './note-link/NoteLinkPicker';
import { $resolveLinkQuerySession } from './note-link/session';
import type { ActiveLinkQuery, LinkPickerState, LinkQuerySession } from './note-link/types';

function isTypingTrigger(event: KeyboardEvent): boolean {
  return event.key === '@' && !event.altKey && !event.metaKey && !event.ctrlKey;
}

export function NoteLinkPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() => {
    const root = editor.getRootElement();
    return root ? root.closest<HTMLElement>('.editor-container') : null;
  });
  const [picker, setPicker] = useState<LinkPickerState | null>(null);

  const pickerRef = useRef<LinkPickerState | null>(null);
  const sessionRef = useRef<LinkQuerySession | null>(null);
  const pendingTriggerRef = useRef(false);

  const setPickerState = useCallback((next: LinkPickerState | null) => {
    pickerRef.current = next;
    setPicker(next);
  }, []);

  const closeSession = useCallback(() => {
    sessionRef.current = null;
    pendingTriggerRef.current = false;
    setPickerState(null);
  }, [setPickerState]);

  const syncPickerFromSelection = useCallback(() => {
    const nextState = editor.getEditorState().read((): {
      kind: 'update';
      query: string;
      options: LinkPickerState['options'];
      activeIndex: number;
    } | { kind: 'keep' } | { kind: 'close' } => {
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

      const resolved = $resolveLinkQuerySession(anchorNode, caretOffset, seededSession);
      if (!resolved) {
        sessionRef.current = null;
        return { kind: 'close' };
      }

      sessionRef.current = resolved.session;
      const nextOptions = $resolveLinkPickerOptions(resolved.query, anchorNode, LINK_PICKER_RESULT_LIMIT);
      const nextActiveIndex = clampActiveIndex(pickerRef.current?.activeIndex ?? 0, nextOptions.length);

      return {
        kind: 'update',
        query: resolved.query,
        options: nextOptions,
        activeIndex: nextActiveIndex,
      };
    });

    if (nextState.kind === 'close') {
      closeSession();
      return;
    }

    if (nextState.kind === 'keep') {
      return;
    }

    const anchor = resolveLinkPickerAnchor(editor);
    if (!anchor) {
      closeSession();
      return;
    }

    setPickerState({
      query: nextState.query,
      options: nextState.options,
      activeIndex: nextState.activeIndex,
      anchor,
    });
  }, [closeSession, editor, setPickerState]);

  const moveActive = useCallback(
    (direction: 'up' | 'down') => {
      const current = pickerRef.current;
      if (!current || current.options.length === 0) {
        return;
      }

      const delta = direction === 'down' ? 1 : -1;
      const nextIndex = clampActiveIndex(current.activeIndex + delta, current.options.length);
      if (nextIndex === current.activeIndex) {
        return;
      }

      setPickerState({ ...current, activeIndex: nextIndex });
    },
    [setPickerState]
  );

  const $resolveActiveQuery = useCallback((): ActiveLinkQuery | null => {
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
    const resolved = $resolveLinkQuerySession(anchorNode, caretOffset, currentSession);
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

  const $removeActiveQueryToken = useCallback((): boolean => {
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

    closeSession();
    return true;
  }, [$resolveActiveQuery, closeSession]);

  const $confirmActiveOption = useCallback((): boolean => {
    const activeQuery = $resolveActiveQuery();
    if (!activeQuery || !sessionRef.current) {
      return false;
    }

    const options = $resolveLinkPickerOptions(activeQuery.query, activeQuery.anchorNode, LINK_PICKER_RESULT_LIMIT);
    if (options.length === 0) {
      return true;
    }

    const activeIndex = clampActiveIndex(pickerRef.current?.activeIndex ?? 0, options.length);
    const activeOption = options[activeIndex];
    if (!activeOption) {
      return true;
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

    const insertionSelection = $getSelection();
    if (!$isRangeSelection(insertionSelection)) {
      return false;
    }

    const linkNode = $createLinkNode(createInternalNoteLinkUrl(docId, activeOption.noteId));
    linkNode.append($createTextNode(activeOption.title));
    insertionSelection.insertNodes([linkNode, $createTextNode(' ')]);

    closeSession();
    return true;
  }, [$resolveActiveQuery, closeSession, docId]);

  const handleLinkClick = useCallback((event: MouseEvent): boolean => {
    if (event.defaultPrevented || event.button !== 0) {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    if (!(event.target instanceof Element)) {
      return false;
    }

    const root = editor.getRootElement();
    const anchor = event.target.closest<HTMLAnchorElement>('a.text-link');
    if (!root || !anchor || !root.contains(anchor)) {
      return false;
    }

    const noteId = editor.read(() => {
      const lexicalNode = $getNearestNodeFromDOMNode(anchor);
      if (!lexicalNode) {
        return null;
      }
      if ($isLinkNode(lexicalNode)) {
        return parseInternalNoteLinkUrl(lexicalNode.getURL());
      }
      const parent = lexicalNode.getParent();
      return $isLinkNode(parent) ? parseInternalNoteLinkUrl(parent.getURL()) : null;
    });

    if (!noteId || noteId.docId !== docId) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    queueMicrotask(() => {
      editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId: noteId.noteId });
    });
    return true;
  }, [docId, editor]);

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
        CLICK_COMMAND,
        (event: MouseEvent) => {
          return handleLinkClick(event);
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || sessionRef.current) {
            return false;
          }
          if (event.isComposing) {
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
        KEY_ARROW_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!sessionRef.current) {
            return false;
          }
          if (event && (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)) {
            return false;
          }
          event?.preventDefault();
          event?.stopPropagation();
          moveActive('down');
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!sessionRef.current) {
            return false;
          }
          if (event && (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)) {
            return false;
          }
          event?.preventDefault();
          event?.stopPropagation();
          moveActive('up');
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          const handled = $confirmActiveOption();
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
          const handled = $confirmActiveOption();
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
          const handled = $removeActiveQueryToken();
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
        (event: KeyboardEvent | null) => {
          const current = pickerRef.current;
          if (!sessionRef.current || !current || current.query.length > 0) {
            return false;
          }
          event?.preventDefault();
          event?.stopPropagation();
          closeSession();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      () => {
        closeSession();
      }
    );
  }, [closeSession, $confirmActiveOption, editor, handleLinkClick, moveActive, $removeActiveQueryToken, syncPickerFromSelection]);

  if (!picker || !portalRoot) {
    return null;
  }

  return <NoteLinkPicker picker={picker} portalRoot={portalRoot} />;
}
