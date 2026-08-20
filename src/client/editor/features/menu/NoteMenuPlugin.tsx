import type { ListType } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Header, Menu, MenuItem, MenuSection } from 'react-aria-components';
import { $getNoteId } from '#client/editor/runtime/note-ids/note-id-state';

import { FOLD_VIEW_TO_LEVEL_COMMAND, OPEN_NOTE_MENU_COMMAND, SET_NOTE_CHECKED_COMMAND, SET_NOTE_FOLD_COMMAND, ZOOM_TO_NOTE_COMMAND } from '#client/editor/foundation/commands';
import { $resolveFocusNoteKey } from '#client/editor/outline/note-context';
import { focusEditorRoot } from '#client/editor/runtime/focus';
import { requireContentItemFromNode } from '#client/editor/outline/schema';
import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { $getNestedListType, $setNestedListType } from '#client/editor/features/list-types/nested-list-type';
import { handleNoteMenuShortcut } from '#client/editor/features/menu/note-menu-shortcuts';
import type { NoteMenuShortcutEvent } from '#client/editor/features/menu/note-menu-shortcuts';
import { $resolveNoteStateFromDOMNode } from '#client/editor/features/menu/note-state';
import { useZoomNoteId } from '#client/editor/view/EditorViewProvider';
import { isOtherPopupActive, setPopupActive } from '#client/editor/triggers/active-popup';
import { EditorPopupOverlay } from '#client/editor/triggers/overlay';
import { resolveCaretTargetRect } from '#client/editor/triggers/target-rect';

type NoteMenuTarget = 'caret' | 'controls' | 'row';

interface NoteMenuState {
  noteKey: string;
  hasChildren: boolean;
  isFolded: boolean;
  isZoomRoot: boolean;
  childListType: ListType | null;
  target: NoteMenuTarget;
}

type MenuShortcutEvent = NoteMenuShortcutEvent;

const DOUBLE_SHIFT_WINDOW_MS = 500;

const listTypeOptions = [
  { type: 'number' as const, label: 'Numbered list', id: 'list-number' },
  { type: 'check' as const, label: 'Checklist', id: 'list-check' },
  { type: 'bullet' as const, label: 'Bulleted list', id: 'list-bullet' },
];

const renderShortcutLabel = (label: string, shortcut: string) => {
  const lowerLabel = label.toLowerCase();
  const lowerShortcut = shortcut.toLowerCase();
  const index = lowerLabel.indexOf(lowerShortcut);
  if (index === -1) {
    return label;
  }
  return (
    <span className="note-menu-label">
      {label.slice(0, index)}
      <span className="note-menu-shortcut">{label.slice(index, index + 1)}</span>
      {label.slice(index + 1)}
    </span>
  );
};

export function NoteMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const popupToken = useRef(Symbol('note-menu')).current;
  const rootRef = useRef(editor.getRootElement());
  const zoomNoteId = useZoomNoteId();
  const zoomNoteIdRef = useRef(zoomNoteId);
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
  const menuShortcutHandlerRef = useRef<((event: KeyboardEvent) => boolean) | null>(null);

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

  const triggerFoldToggle = () => {
    const current = menuRef.current;
    if (!current || !current.hasChildren || current.isZoomRoot) {
      return;
    }
    focusRoot();
    editor.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'toggle', noteItemKey: current.noteKey });
    closeMenu();
  };

  const triggerToggleChecked = () => {
    const current = menuRef.current;
    if (!current) {
      return;
    }
    focusRoot();
    editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle', noteItemKey: current.noteKey });
    closeMenu();
  };

  const triggerZoom = () => {
    const current = menuRef.current;
    if (!current) {
      closeMenu();
      return;
    }
    const noteId = editor.getEditorState().read(() => {
      const node = $getNodeByKey(current.noteKey);
      if (!node) {
        return null;
      }
      const contentItem = requireContentItemFromNode(node);
      return $getNoteId(contentItem);
    });
    if (!noteId) {
      closeMenu();
      return;
    }
    focusRoot();
    editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId });
    closeMenu();
  };

  const triggerFoldViewToLevel = (level: number) => {
    focusRoot();
    editor.dispatchCommand(FOLD_VIEW_TO_LEVEL_COMMAND, { level });
    closeMenu();
  };

  const handleMenuShortcut = (event: MenuShortcutEvent): boolean => {
    return handleNoteMenuShortcut(event, menuRef.current, {
      foldViewToLevel: triggerFoldViewToLevel,
      toggleFold: triggerFoldToggle,
      zoom: triggerZoom,
    });
  };

  menuShortcutHandlerRef.current = handleMenuShortcut;

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
      if (menuShortcutHandlerRef.current?.(event)) {
        return;
      }
      doubleShiftHandlerRef.current?.(event);
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      menuShortcutHandlerRef.current = null;
    };
  }, []);

  useEffect(() => {
    installOutlineSelectionHelpers(editor);

    const resolveNoteState = (
      element: HTMLElement
    ): {
      noteKey: string;
      hasChildren: boolean;
      isFolded: boolean;
      isZoomRoot: boolean;
      childListType: ListType | null;
    } | null => {
      return editor.read(() => {
        const resolved = $resolveNoteStateFromDOMNode(element);
        if (!resolved) {
          return null;
        }
        const childListType = resolved.hasChildren ? $getNestedListType(resolved.contentItem) : null;
        return {
          noteKey: resolved.noteKey,
          hasChildren: resolved.hasChildren,
          isFolded: resolved.isFolded,
          isZoomRoot: Boolean(zoomNoteIdRef.current && resolved.noteId === zoomNoteIdRef.current),
          childListType,
        };
      });
    };

    const resolveSelectionKey = (): string | null =>
      editor.read(() => $resolveFocusNoteKey(editor));

    const openMenuForKey = (noteKey: string, target: NoteMenuTarget = 'row'): boolean => {
      // One editor popup at a time: don't open the menu on top of an open picker.
      if (!menuRef.current && isOtherPopupActive(editor, popupToken)) {
        return false;
      }
      if (menuRef.current?.noteKey === noteKey) {
        closeMenu();
        return true;
      }
      const root = rootRef.current ?? editor.getRootElement();
      if (!root) {
        closeMenu();
        return false;
      }
      const element = editor.getElementByKey(noteKey);
      if (!(element instanceof HTMLElement) || !root.contains(element)) {
        closeMenu();
        return false;
      }
      const noteState = resolveNoteState(element);
      if (!noteState) {
        closeMenu();
        return false;
      }
      setMenuState({ ...noteState, target });
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
        const key = resolveSelectionKey();
        if (key) {
          openMenuForKey(key, 'caret');
        }
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
      ({ noteItemKey, anchor }) => openMenuForKey(noteItemKey, anchor ?? 'row'),
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

  useEffect(() => {
    zoomNoteIdRef.current = zoomNoteId;
  }, [zoomNoteId]);

  if (!portalRoot || !menu) {
    return null;
  }

  const foldLabel = menu.isFolded ? 'Unfold' : 'Fold';
  const listActions =
    menu.hasChildren && menu.childListType
      ? listTypeOptions.filter((option) => option.type !== menu.childListType)
      : [];

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
    return editor.getElementByKey(menu.noteKey)?.getBoundingClientRect() ?? null;
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (handleNoteMenuShortcut(event.nativeEvent, menu, {
      foldViewToLevel: triggerFoldViewToLevel,
      toggleFold: triggerFoldToggle,
      zoom: triggerZoom,
    })) {
      return;
    }
    if (event.key !== 'Tab' && event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    focusRoot();
  };

  const convertChildList = (listType: ListType) => {
    focusRoot();
    editor.update(() => {
      const node = $getNodeByKey(menu.noteKey);
      if (!node) {
        return;
      }
      const contentItem = requireContentItemFromNode(node);
      $setNestedListType(contentItem, listType);
    });
    closeMenu();
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
      <div onKeyDown={handleMenuKeyDown}>
      <Menu
        aria-label="Quick action menu"
        autoFocus
        className="note-menu-dropdown remdo-menu"
        data-note-menu
        data-note-menu-note-key={menu.noteKey}
      >
        <MenuSection>
          <Header data-note-menu-section="note">Note</Header>
          <MenuItem data-note-menu-item="toggle-checked" id="toggle-checked" onAction={triggerToggleChecked}>
            Toggle checked
          </MenuItem>
          {menu.hasChildren && !menu.isZoomRoot
            ? (
                <MenuItem data-note-menu-item="fold" id="fold" onAction={triggerFoldToggle}>
                  {renderShortcutLabel(foldLabel, 'F')}
                </MenuItem>
              )
            : null}
          <MenuItem data-note-menu-item="zoom" id="zoom" onAction={triggerZoom}>
            {renderShortcutLabel('Zoom', 'Z')}
          </MenuItem>
        </MenuSection>
        {listActions.length > 0
          ? (
              <MenuSection>
                <Header data-note-menu-section="children">Children</Header>
                {listActions.map((option) => (
                  <MenuItem
                    data-note-menu-item={option.id}
                    id={option.id}
                    key={option.type}
                    onAction={() => {
                      convertChildList(option.type);
                    }}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </MenuSection>
            )
          : null}
        <MenuSection>
          <Header data-note-menu-section="view">View</Header>
          <MenuItem data-note-menu-item="view-fold-to-level" id="view-fold-to-level" onAction={() => triggerFoldViewToLevel(1)}>
            <span>
              Fold to level [
              <span className="note-menu-shortcut">0-9</span>
              ]
            </span>
          </MenuItem>
        </MenuSection>
      </Menu>
      </div>
    </EditorPopupOverlay>
  );
}
