import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
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
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { resolveCaretPickerAnchor } from './anchor';
import { $isTriggerAtBoundary } from './boundary';
import { isOtherPopupActive, setPopupActive } from './active-popup';
import { $openTriggerSession, $resolvePinnedSession } from './session';
import type { PickerAnchor, TriggerSession, TriggerSpec } from './types';

interface InternalPickerState<TOption> {
  query: string;
  options: TOption[];
  activeIndex: number;
  anchor: PickerAnchor;
}

function clampActiveIndex(activeIndex: number, optionsLength: number): number {
  if (optionsLength === 0) {
    return -1;
  }
  return Math.max(0, Math.min(activeIndex, optionsLength - 1));
}

function completeKeyboardCommand(event: KeyboardEvent | null): true {
  event?.preventDefault();
  event?.stopPropagation();
  return true;
}

function isTypingTrigger(event: KeyboardEvent, triggerChar: string): boolean {
  if (event.key !== triggerChar || event.metaKey) {
    return false;
  }

  const altGraphActive = event.getModifierState('AltGraph');
  const ctrlAltChord = event.ctrlKey && event.altKey;
  if (altGraphActive || ctrlAltChord) {
    return true;
  }

  return !event.altKey && !event.ctrlKey;
}

// The shared inline-trigger lifecycle. Owns open gating (fresh keypress at a
// boundary, never on caret re-entry), query sync, dismissal, and command
// wiring; the spec supplies option source, popup, and commit. See
// docs/outliner/triggers.md.
export function useTriggerSession<TOption>(spec: TriggerSpec<TOption>): ReactNode {
  const [editor] = useLexicalComposerContext();
  const sessionToken = useRef(Symbol('trigger-session')).current;
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() => {
    const root = editor.getRootElement();
    return root ? root.closest<HTMLElement>('.editor-container') : null;
  });
  const [picker, setPicker] = useState<InternalPickerState<TOption> | null>(null);

  const pickerRef = useRef<InternalPickerState<TOption> | null>(null);
  const sessionRef = useRef<TriggerSession | null>(null);
  const pendingTriggerRef = useRef(false);

  // Hold the spec in a ref so the engine's effects/callbacks do not depend on
  // its identity. Plugins build their spec inline (a new object each render);
  // without this, the command-registration effect would tear down and re-run on
  // every render and its cleanup would close a just-opened session.
  const specRef = useRef(spec);
  specRef.current = spec;

  const setPickerState = useCallback((next: InternalPickerState<TOption> | null) => {
    pickerRef.current = next;
    setPopupActive(editor, sessionToken, next !== null);
    setPicker(next);
  }, [editor, sessionToken]);

  const closeSession = useCallback(() => {
    sessionRef.current = null;
    pendingTriggerRef.current = false;
    setPickerState(null);
  }, [setPickerState]);

  const syncFromSelection = useCallback(() => {
    const nextState = editor.getEditorState().read((): {
      kind: 'update';
      query: string;
      options: TOption[];
      activeIndex: number;
    } | { kind: 'keep' } | { kind: 'close' } => {
      if (editor.selection.isStructural()) {
        // A structural selection is not a typing context, so a pending trigger
        // keypress here can never resolve — drop it rather than leave it armed.
        pendingTriggerRef.current = false;
        return { kind: 'close' };
      }

      // Any selection that is not a collapsed text caret means the user has left
      // the query (e.g. a node selection from clicking an inline token, or a
      // range selection). Close the session rather than keep it mounted — a
      // lingering session would otherwise stack under another picker and consume
      // Escape/Enter meant for it.
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return { kind: 'close' };
      }

      const anchorNode = selection.anchor.getNode();
      if (!$isTextNode(anchorNode)) {
        return { kind: 'close' };
      }

      const caretOffset = selection.anchor.offset;
      const pendingTrigger = pendingTriggerRef.current;

      const currentSession = sessionRef.current;
      // The open gate: with no live session and no fresh trigger keypress, a
      // selection change never opens the picker — so returning the caret beside
      // an existing trigger character does not reopen it.
      if (!pendingTrigger && !currentSession) {
        return { kind: 'close' };
      }

      // A fresh trigger keypress opens a new session by scanning to the trigger;
      // an already-open session is re-resolved against its pinned span only and
      // never retargets onto a different trigger.
      const resolved = currentSession
        ? $resolvePinnedSession(specRef.current.triggerChar, anchorNode, caretOffset, currentSession)
        : $openTriggerSession(specRef.current.triggerChar, anchorNode, caretOffset);
      if (!resolved) {
        // Keep a pending trigger armed: the trigger keypress and the character
        // insertion are separate editor updates, so an update landing in between
        // (e.g. a collab patch) must not consume the pending flag against a state
        // that does not contain the trigger character yet.
        if (!pendingTrigger) {
          sessionRef.current = null;
          return { kind: 'close' };
        }
        return { kind: 'keep' };
      }

      // The trigger character is now resolved, so the pending keypress is spent.
      pendingTriggerRef.current = false;

      // On a fresh trigger keypress, only open when the trigger landed at a
      // boundary. An existing session has already cleared this gate.
      if (!currentSession && !$isTriggerAtBoundary(resolved.triggerNode, resolved.session.triggerOffset)) {
        sessionRef.current = null;
        return { kind: 'close' };
      }

      sessionRef.current = resolved.session;
      const options = specRef.current.$resolveOptions(resolved.query, anchorNode);
      const activeIndex = clampActiveIndex(pickerRef.current?.activeIndex ?? 0, options.length);
      return { kind: 'update', query: resolved.query, options, activeIndex };
    });

    if (nextState.kind === 'close') {
      closeSession();
      return;
    }
    if (nextState.kind === 'keep') {
      return;
    }

    const anchor = resolveCaretPickerAnchor(editor);
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

  const setActiveIndex = useCallback(
    (index: number) => {
      const current = pickerRef.current;
      if (!current || current.options.length === 0) {
        return;
      }
      const nextIndex = clampActiveIndex(index, current.options.length);
      if (nextIndex !== current.activeIndex) {
        setPickerState({ ...current, activeIndex: nextIndex });
      }
    },
    [setPickerState]
  );

  const moveActive = useCallback(
    (direction: 'up' | 'down') => {
      const current = pickerRef.current;
      if (!current) {
        return;
      }
      setActiveIndex(current.activeIndex + (direction === 'down' ? 1 : -1));
    },
    [setActiveIndex]
  );

  // Build the trigger-through-caret range a commit replaces, re-resolving the
  // session against the current caret first.
  const $resolveCommitTarget = useCallback(() => {
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
    // Commit re-validates against the pinned span (never a different trigger).
    const resolved = $resolvePinnedSession(specRef.current.triggerChar, anchorNode, caretOffset, currentSession);
    if (!resolved) {
      sessionRef.current = null;
      return null;
    }
    sessionRef.current = resolved.session;

    const range = $createRangeSelection();
    range.setTextNodeRange(resolved.triggerNode, resolved.session.triggerOffset, anchorNode, caretOffset);
    return { range, anchorNode, query: resolved.query };
  }, []);

  // Delete the bare trigger character (used by Backspace on an empty query) and
  // end the session. The commit range over an empty query is exactly the
  // trigger character.
  const $deleteTriggerChar = useCallback((): boolean => {
    const target = $resolveCommitTarget();
    if (!target) {
      return false;
    }
    $setSelection(target.range);
    target.range.insertText('');
    closeSession();
    return true;
  }, [$resolveCommitTarget, closeSession]);

  // Commit an explicit option over the current trigger span. Used by popups
  // that pick a value directly (e.g. clicking a calendar day) rather than from
  // the resolved option list.
  const $commitOption = useCallback(
    (option: TOption): boolean => {
      const target = $resolveCommitTarget();
      if (!target) {
        return false;
      }
      $setSelection(target.range);
      specRef.current.$commit(option, target);
      closeSession();
      return true;
    },
    [$resolveCommitTarget, closeSession]
  );

  // Confirm the active option from the resolved list (the keyboard/row path).
  const $confirmActiveOption = useCallback(
    (forcedActiveIndex?: number): boolean => {
      const target = $resolveCommitTarget();
      if (!target) {
        return false;
      }

      const options = specRef.current.$resolveOptions(target.query, target.anchorNode);
      if (options.length === 0) {
        closeSession();
        return true;
      }

      const activeIndex = clampActiveIndex(forcedActiveIndex ?? pickerRef.current?.activeIndex ?? 0, options.length);
      const activeOption = options[activeIndex];
      if (!activeOption) {
        return true;
      }

      $setSelection(target.range);
      specRef.current.$commit(activeOption, target);
      closeSession();
      return true;
    },
    [$resolveCommitTarget, closeSession]
  );

  const handlePickerMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    // Keep the caret/selection stable while interacting with the picker.
    event.preventDefault();
  }, []);

  const handleItemMouseOver = useCallback((index: number) => {
    setActiveIndex(index);
  }, [setActiveIndex]);

  const handleItemMouseDown = useCallback(
    (index: number, event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      editor.update(() => {
        $confirmActiveOption(index);
      });
    },
    [$confirmActiveOption, editor]
  );

  const handleCommitOption = useCallback(
    (option: TOption) => {
      editor.update(() => {
        $commitOption(option);
      });
    },
    [$commitOption, editor]
  );

  // Cancel from inside a focus-trapping popup (the calendar): close and return
  // focus to the editor. Lexical key commands do not fire while focus is trapped
  // in the popup, so the popup calls this directly (e.g. on Escape).
  const handleCancel = useCallback(() => {
    closeSession();
    editor.focus();
  }, [closeSession, editor]);

  useEffect(() => {
    installOutlineSelectionHelpers(editor);
    syncFromSelection();

    // Plain Enter confirms the active option. A modifier+Enter (e.g.
    // Cmd/Ctrl+Enter) is owned while the picker is open but is not a commit key:
    // it is swallowed so it neither confirms nor runs the editor command beneath.
    const $handleEnterCommand = (event: KeyboardEvent | null) => {
      if (!sessionRef.current) {
        return false;
      }
      if (event && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
        return completeKeyboardCommand(event);
      }
      return $confirmActiveOption() ? completeKeyboardCommand(event) : false;
    };

    // Tab does not confirm: it closes the picker and falls through to the
    // editor's normal Tab action (indent). The trigger and query stay as text.
    const $handleTabCommand = () => {
      if (!sessionRef.current) {
        return false;
      }
      closeSession();
      return false;
    };

    return mergeRegister(
      editor.registerRootListener((nextRoot, previousRoot) => {
        if (previousRoot === nextRoot) {
          return;
        }
        setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      }),
      editor.registerUpdateListener(() => {
        syncFromSelection();
      }),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent | null) => {
          if (!event || sessionRef.current || event.isComposing) {
            return false;
          }
          // A trigger typed while another picker is open is ordinary query text,
          // not a new trigger — don't stack a second picker on top.
          if (isOtherPopupActive(editor, sessionToken)) {
            return false;
          }
          if (editor.selection.isStructural() || !isTypingTrigger(event, specRef.current.triggerChar)) {
            return false;
          }
          // Arm the open gate; the boundary is checked in syncFromSelection once
          // the trigger character has been inserted (independent of keystroke
          // timing).
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
          moveActive('down');
          return completeKeyboardCommand(event);
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
          moveActive('up');
          return completeKeyboardCommand(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(KEY_ENTER_COMMAND, $handleEnterCommand, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_TAB_COMMAND, $handleTabCommand, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event: KeyboardEvent | null) => {
          // Esc closes the picker and keeps the typed trigger as plain text.
          if (!sessionRef.current) {
            return false;
          }
          closeSession();
          return completeKeyboardCommand(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event: KeyboardEvent | null) => {
          // Backspace is ordinary editing. With a non-empty query, let the
          // keystroke shorten it (the engine re-syncs). With an empty query the
          // only thing to delete is the trigger character itself: remove it and
          // end the session.
          const current = pickerRef.current;
          if (!sessionRef.current || !current || current.query.length > 0) {
            return false;
          }
          if (!$deleteTriggerChar()) {
            return false;
          }
          return completeKeyboardCommand(event);
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      () => {
        closeSession();
      }
    );
  }, [closeSession, $confirmActiveOption, $deleteTriggerChar, editor, moveActive, sessionToken, syncFromSelection]);

  useEffect(() => {
    const registerRootBlurListener = (root: HTMLElement | null) => {
      if (!root) {
        return () => {};
      }
      const handleRootBlur = (event: FocusEvent) => {
        if (!sessionRef.current) {
          return;
        }
        // A focus-trapping popup (the calendar) takes focus out of the editor by
        // design; don't treat that as a dismiss. Only close if focus left for
        // somewhere outside both the editor and the popup.
        if (specRef.current.focusModel === 'trap') {
          const next = event.relatedTarget;
          if (next instanceof Element && next.closest('[data-trigger-picker]')) {
            return;
          }
        }
        closeSession();
      };
      // eslint-disable-next-line react/web-api-no-leaked-event-listener -- removed in returned cleanup.
      root.addEventListener('blur', handleRootBlur, true);
      return () => {
        root.removeEventListener('blur', handleRootBlur, true);
      };
    };

    let disposeRootBlurListener = registerRootBlurListener(editor.getRootElement());
    const unregisterRootListener = editor.registerRootListener((nextRoot, previousRoot) => {
      if (nextRoot === previousRoot) {
        return;
      }
      disposeRootBlurListener();
      disposeRootBlurListener = registerRootBlurListener(nextRoot);
    });

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!sessionRef.current) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const root = editor.getRootElement();
      if (root && root.contains(target)) {
        return;
      }
      const targetElement = target instanceof Element ? target : target.parentElement;
      if (targetElement?.closest('[data-trigger-picker]')) {
        return;
      }
      closeSession();
    };
    document.addEventListener('mousedown', handleDocumentMouseDown, true);

    return () => {
      unregisterRootListener();
      disposeRootBlurListener();
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, [closeSession, editor]);

  if (!picker || !portalRoot) {
    return null;
  }

  // The engine owns the portal and the positioned anchor wrapper (carrying the
  // shared `data-trigger-picker` dismissal hook); the spec renders only the
  // popup body.
  const anchorStyle: CSSProperties = { left: picker.anchor.left, top: picker.anchor.top };
  return createPortal(
    <div
      className="trigger-picker-anchor"
      style={anchorStyle}
      data-trigger-picker
      onMouseDown={handlePickerMouseDown}
    >
      {spec.renderPopup(picker, {
        onPickerMouseDown: handlePickerMouseDown,
        onItemMouseOver: handleItemMouseOver,
        onItemMouseDown: handleItemMouseDown,
        commitOption: handleCommitOption,
        cancel: handleCancel,
      })}
    </div>,
    portalRoot
  );
}
