import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND, mergeRegister } from 'lexical';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenDocument, NoteId } from '#note-sdk';
import { OPEN_NOTE_MENU_COMMAND } from '#client/editor/foundation/commands';
import { focusEditorRoot } from '#client/editor/runtime/focus';
import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { isOtherPopupActive, setPopupActive } from '#client/editor/triggers/active-popup';
import { EditorPopupOverlay } from '#client/editor/triggers/overlay';
import { resolveCaretTargetRect } from '#client/editor/triggers/target-rect';
import { resolveMenuNoteElement, resolveMenuNoteId } from './note-menu-target';
import { NoteMenu } from './NoteMenu';

type NoteMenuTarget = 'caret' | 'controls' | 'row';

interface NoteMenuState {
  noteId: NoteId;
  target: NoteMenuTarget;
}

const DOUBLE_SHIFT_WINDOW_MS = 500;

export function NoteMenuPlugin({ openDocument }: { openDocument: OpenDocument }) {
  const [editor] = useLexicalComposerContext();
  const popupToken = useRef(Symbol('note-menu')).current;
  const rootRef = useRef(editor.getRootElement());
  const [rootElement, setRootElement] = useState(() => editor.getRootElement());
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() => {
    const root = editor.getRootElement();
    return root ? root.closest<HTMLElement>('.editor-container') : null;
  });
  const [menu, setMenu] = useState<NoteMenuState | null>(null);
  const menuRef = useRef<NoteMenuState | null>(null);
  const lastShiftRef = useRef(0);
  const shiftCanceledRef = useRef(false);
  const doubleShiftHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  const setMenuState = useCallback((next: NoteMenuState | null) => {
    menuRef.current = next;
    setPopupActive(editor, popupToken, next !== null);
    setMenu(next);
  }, [editor, popupToken]);

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, [setMenuState]);

  const focusRoot = useCallback(() => {
    focusEditorRoot(editor);
  }, [editor]);

  const handleRootFocusOut = useCallback(
    (event: FocusEvent) => {
      if (!menuRef.current) {
        return;
      }
      const root = rootRef.current;
      const anchor = root ? root.closest<HTMLElement>('.editor-container') : null;
      if (!root || !anchor) {
        closeMenu();
        return;
      }
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && anchor.contains(nextTarget)) {
        return;
      }
      closeMenu();
    },
    [closeMenu]
  );

  useEffect(() => {
    if (!rootElement) {
      return;
    }
    rootElement.addEventListener('focusout', handleRootFocusOut);
    return () => {
      rootElement.removeEventListener('focusout', handleRootFocusOut);
    };
  }, [handleRootFocusOut, rootElement]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-note-menu], .note-controls__button--menu')) {
        return;
      }
      closeMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [closeMenu, menu]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof Node) || !root.contains(active)) {
        return;
      }
      doubleShiftHandlerRef.current?.(event);
    };
    // Capture phase: editor commands stop propagation on the keys they consume
    // (an arrow inside a body, for example), so a bubble-phase listener would
    // see the Shift presses around them but not the keys between. The double-tap
    // detector would then read two ordinary shifted shortcuts as a double-Shift.
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, []);

  useEffect(() => {
    installOutlineSelectionHelpers(editor);

    const openMenuForKey = (noteKey: string | undefined, target: NoteMenuTarget = 'row'): boolean => {
      // One editor popup at a time: don't open the menu on top of an open picker.
      if (!menuRef.current && isOtherPopupActive(editor, popupToken)) {
        return false;
      }
      const noteId = resolveMenuNoteId(editor, noteKey);
      if (!noteId) {
        closeMenu();
        return false;
      }
      if (menuRef.current?.noteId === noteId) {
        closeMenu();
        return true;
      }
      setMenuState({ noteId, target });
      return true;
    };

    const handleDoubleShift = (event: KeyboardEvent): boolean => {
      if (menuRef.current) {
        return false;
      }
      if (event.key !== 'Shift') {
        if (lastShiftRef.current) {
          shiftCanceledRef.current = true;
        }
        return false;
      }
      if (event.repeat) {
        return false;
      }
      const now = Date.now();
      const elapsed = now - lastShiftRef.current;
      if (elapsed <= DOUBLE_SHIFT_WINDOW_MS && !shiftCanceledRef.current) {
        lastShiftRef.current = 0;
        shiftCanceledRef.current = false;
        openMenuForKey(undefined, 'caret');
        return true;
      }
      lastShiftRef.current = now;
      shiftCanceledRef.current = false;
      return false;
    };
    doubleShiftHandlerRef.current = handleDoubleShift;

    const handleSelectionChange = () => {
      if (!menuRef.current) {
        return false;
      }
      const root = rootRef.current;
      if (!root) {
        closeMenu();
        return false;
      }
      const active = document.activeElement;
      if (active instanceof Node && root.contains(active)) {
        closeMenu();
      }
      return false;
    };

    const unregisterRootListener = editor.registerRootListener((nextRoot, _previousRoot) => {
      rootRef.current = nextRoot;
      setRootElement(nextRoot);
      setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      if (!nextRoot) {
        closeMenu();
      }
    });

    const unregisterOpenCommand = editor.registerCommand(
      OPEN_NOTE_MENU_COMMAND,
      (payload) => {
        return openMenuForKey(payload?.noteItemKey, payload?.anchor ?? 'row');
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterSelectionChange = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      handleSelectionChange,
      COMMAND_PRIORITY_LOW
    );

    return mergeRegister(
      unregisterRootListener,
      unregisterOpenCommand,
      unregisterSelectionChange,
      () => {
        doubleShiftHandlerRef.current = null;
        closeMenu();
      }
    );
  }, [closeMenu, editor, popupToken, setMenuState]);

  const note = useMemo(() => menu ? openDocument.noteRef(menu.noteId) : null, [menu, openDocument]);

  if (!portalRoot || !menu) {
    return null;
  }

  const resolveMenuTargetRect = (): DOMRect | null => {
    if (menu.target === 'caret') {
      return resolveCaretTargetRect();
    }
    if (menu.target === 'controls') {
      const button = portalRoot.querySelector<HTMLElement>('.note-controls__button--menu');
      if (button) {
        return button.getBoundingClientRect();
      }
    }
    return resolveMenuNoteElement(editor, menu.noteId)?.getBoundingClientRect() ?? null;
  };

  return (
    <EditorPopupOverlay
      className="note-menu-overlay"
      editor={editor}
      getTargetRect={resolveMenuTargetRect}
      offset={8}
      placement="right"
      portalRoot={portalRoot}
    >
      <NoteMenu
        note={note!}
        view={openDocument.view}
        selection={openDocument.selection}
        editorRoot={rootElement}
        closeMenu={closeMenu}
        focusRoot={focusRoot}
      />
    </EditorPopupOverlay>
  );
}
