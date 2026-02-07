import type { ListItemNode, ListType } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Menu } from '@mantine/core';
import { mergeRegister } from '@lexical/utils';
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { $isNoteFolded } from '#lib/editor/fold-state';
import { $getNoteId } from '#lib/editor/note-id-state';
import { OPEN_NOTE_MENU_COMMAND, SET_NOTE_CHECKED_COMMAND, TOGGLE_NOTE_FOLD_COMMAND, ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';
import { findNearestListItem, getContentListItem, getContentSiblings, isChildrenWrapper } from '@/editor/outline/list-structure';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';
import { getNestedList } from '@/editor/outline/selection/tree';

interface NoteMenuState {
  noteKey: string;
  hasChildren: boolean;
  isFolded: boolean;
  childListType: ListType | null;
  left: number;
  top: number;
}

interface NoteMenuLayout extends Pick<NoteMenuState, 'left' | 'top'> {}
type NoteMenuAnchor = NoteMenuLayout;

const DOUBLE_SHIFT_WINDOW_MS = 500;

const noteHasChildren = (item: ListItemNode): boolean => {
  const nested = getNestedList(item);
  if (!nested) {
    return false;
  }
  return getContentSiblings(nested).length > 0;
};

const listTypeOptions = [
  { type: 'number' as const, label: 'Numbered list', id: 'list-number' },
  { type: 'check' as const, label: 'Checklist', id: 'list-check' },
  { type: 'bullet' as const, label: 'Bulleted list', id: 'list-bullet' },
];

const resolveAnchorFromRect = (rect: DOMRect, anchorRect: DOMRect): NoteMenuAnchor => ({
  left: rect.right - anchorRect.left,
  top: rect.top - anchorRect.top + rect.height / 2,
});

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
  const rootRef = useRef<HTMLElement | null>(editor.getRootElement());
  const [rootElement, setRootElement] = useState<HTMLElement | null>(() => editor.getRootElement());
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
    setMenu(next);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, [setMenuState]);

  const triggerFoldToggle = () => {
    const current = menuRef.current;
    if (!current || !current.hasChildren) {
      return;
    }
    editor.dispatchCommand(TOGGLE_NOTE_FOLD_COMMAND, { noteKey: current.noteKey });
    closeMenu();
    editor.focus();
  };

  const triggerToggleChecked = () => {
    const current = menuRef.current;
    if (!current) {
      return;
    }
    editor.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle', noteKey: current.noteKey });
    closeMenu();
    editor.focus();
  };

  const triggerZoom = () => {
    const current = menuRef.current;
    if (!current) {
      return;
    }
    const noteId = editor.getEditorState().read(() => {
      const node = $getNodeByKey<ListItemNode>(current.noteKey);
      if (!node) {
        return null;
      }
      const contentItem = getContentListItem(node);
      if (isChildrenWrapper(contentItem)) {
        return null;
      }
      return $getNoteId(contentItem);
    });
    if (!noteId) {
      closeMenu();
      return;
    }
    editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId });
    closeMenu();
    editor.focus();
  };

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

  const syncMenuPosition = useCallback(() => {
    const current = menuRef.current;
    if (!current) {
      return;
    }
    const root = rootRef.current ?? editor.getRootElement();
    const container = root ? root.closest<HTMLElement>('.editor-container') : null;
    if (!root || !container) {
      closeMenu();
      return;
    }
    const element = editor.getElementByKey(current.noteKey);
    if (!(element instanceof HTMLElement)) {
      closeMenu();
      return;
    }
    if (!root.contains(element)) {
      closeMenu();
      return;
    }
    const anchorRect = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setMenuState({ ...current, ...resolveAnchorFromRect(rect, anchorRect) });
  }, [closeMenu, editor, setMenuState]);

  useEffect(() => {
    if (!rootElement) {
      return;
    }
    rootElement.addEventListener('scroll', syncMenuPosition);
    rootElement.addEventListener('focusout', handleRootFocusOut);
    return () => {
      rootElement.removeEventListener('scroll', syncMenuPosition);
      rootElement.removeEventListener('focusout', handleRootFocusOut);
    };
  }, [handleRootFocusOut, rootElement, syncMenuPosition]);

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
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, []);

  useEffect(() => {
    installOutlineSelectionHelpers(editor);

    const resolveNoteState = (
      element: HTMLElement
    ): { noteKey: string; hasChildren: boolean; isFolded: boolean; childListType: ListType | null } | null => {
      let result:
        | { noteKey: string; hasChildren: boolean; isFolded: boolean; childListType: ListType | null }
        | null = null;
      editor.read(() => {
        const node = $getNearestNodeFromDOMNode(element);
        if (!node) {
          result = null;
          return;
        }
        const listItem = findNearestListItem(node);
        if (!listItem) {
          result = null;
          return;
        }
        const contentItem = getContentListItem(listItem);
        if (isChildrenWrapper(contentItem)) {
          result = null;
          return;
        }
        const hasChildren = noteHasChildren(contentItem);
        const childListType = hasChildren ? getNestedList(contentItem)?.getListType() ?? null : null;
        result = {
          noteKey: contentItem.getKey(),
          hasChildren,
          isFolded: hasChildren && $isNoteFolded(contentItem),
          childListType,
        };
      });
      return result;
    };

    const resolveSelectionKey = (): string | null => {
      let key: string | null = null;
      editor.read(() => {
        const outlineSelection = editor.selection.get();
        if (outlineSelection?.focusKey) {
          key = outlineSelection.focusKey;
          return;
        }
        const domSelection = globalThis.getSelection();
        const focusNode = domSelection?.focusNode ?? domSelection?.anchorNode ?? null;
        if (!focusNode) {
          return;
        }
        const focusLexical = $getNearestNodeFromDOMNode(focusNode);
        const focusItem = focusLexical ? findNearestListItem(focusLexical) : null;
        if (!focusItem) {
          return;
        }
        const contentItem = getContentListItem(focusItem);
        if (isChildrenWrapper(contentItem)) {
          return;
        }
        key = contentItem.getKey();
      });
      return key;
    };

    const resolveContainerRect = () => {
      const root = rootRef.current ?? editor.getRootElement();
      const container = root ? root.closest<HTMLElement>('.editor-container') : null;
      if (!root || !container) {
        return null;
      }
      return { root, container, rect: container.getBoundingClientRect() };
    };

    const resolveCaretAnchor = (): NoteMenuAnchor | null => {
      const resolved = resolveContainerRect();
      if (!resolved) {
        return null;
      }
      const selection = globalThis.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return resolveAnchorFromRect(rect, resolved.rect);
      }
      const clientRects = range.getClientRects();
      const firstRect = clientRects.item(0);
      if (firstRect) {
        return resolveAnchorFromRect(firstRect, resolved.rect);
      }
      return null;
    };

    const openMenuForKey = (noteKey: string, anchorOverride?: NoteMenuAnchor): boolean => {
      if (menuRef.current?.noteKey === noteKey) {
        closeMenu();
        return true;
      }
      const resolved = resolveContainerRect();
      if (!resolved) {
        closeMenu();
        return false;
      }
      const { root, rect: containerRect } = resolved;
      const element = editor.getElementByKey(noteKey);
      if (!(element instanceof HTMLElement)) {
        closeMenu();
        return false;
      }
      if (!root.contains(element)) {
        closeMenu();
        return false;
      }
      const noteState = resolveNoteState(element);
      if (!noteState) {
        closeMenu();
        return false;
      }
      const anchor = anchorOverride ?? resolveAnchorFromRect(element.getBoundingClientRect(), containerRect);
      setMenuState({ ...noteState, ...anchor });
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
          openMenuForKey(key, resolveCaretAnchor() ?? undefined);
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
      ({ noteKey, anchor }) => openMenuForKey(noteKey, anchor),
      COMMAND_PRIORITY_LOW
    );

    const unregisterSelectionChange = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      handleSelectionChange,
      COMMAND_PRIORITY_LOW
    );

    globalThis.addEventListener('resize', syncMenuPosition);

    return mergeRegister(
      unregisterRootListener,
      unregisterOpenCommand,
      unregisterSelectionChange,
      () => {
        globalThis.removeEventListener('resize', syncMenuPosition);
        doubleShiftHandlerRef.current = null;
        closeMenu();
      }
    );
  }, [closeMenu, editor, setMenuState, syncMenuPosition]);

  if (!portalRoot || !menu) {
    return null;
  }

  const style: CSSProperties = {
    left: menu.left,
    top: menu.top,
  };

  const foldLabel = menu.isFolded ? 'Unfold' : 'Fold';
  const listActions =
    menu.hasChildren && menu.childListType
      ? listTypeOptions.filter((option) => option.type !== menu.childListType)
      : [];

  return createPortal(
    <Menu
      opened
      withinPortal={false}
      closeOnItemClick={false}
      onClose={closeMenu}
      position="right"
      offset={8}
      returnFocus={false}
    >
      <Menu.Target>
        <span className="note-menu-anchor" style={style} />
      </Menu.Target>
      <Menu.Dropdown
        className="note-menu-dropdown"
        data-note-menu
        data-note-menu-note-key={menu.noteKey}
        onKeyDown={(event) => {
          const key = event.key.toLowerCase();
          if (key === 'f' && menuRef.current?.hasChildren) {
            event.preventDefault();
            event.stopPropagation();
            triggerFoldToggle();
            return;
          }
          if (key === 'z') {
            event.preventDefault();
            event.stopPropagation();
            triggerZoom();
          }
        }}
      >
        <Menu.Item data-note-menu-item="toggle-checked" onClick={triggerToggleChecked}>
          Toggle checked
        </Menu.Item>
        {menu.hasChildren ? (
          <Menu.Item data-note-menu-item="fold" onClick={triggerFoldToggle}>
            {renderShortcutLabel(foldLabel, 'F')}
          </Menu.Item>
        ) : null}
        <Menu.Item data-note-menu-item="zoom" onClick={triggerZoom}>
          {renderShortcutLabel('Zoom', 'Z')}
        </Menu.Item>
        {listActions.length > 0 ? (
          <>
            <Menu.Label>Children</Menu.Label>
            {listActions.map((option) => (
              <Menu.Item
                key={option.type}
                data-note-menu-item={option.id}
                onClick={() => {
                  editor.update(() => {
                    const node = $getNodeByKey<ListItemNode>(menu.noteKey);
                    if (!node) {
                      return;
                    }
                    const contentItem = getContentListItem(node);
                    if (isChildrenWrapper(contentItem)) {
                      return;
                    }
                    const nested = getNestedList(contentItem);
                    if (!nested) {
                      return;
                    }
                    nested.setListType(option.type);
                  });
                  closeMenu();
                  editor.focus();
                }}
              >
                {option.label}
              </Menu.Item>
            ))}
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>,
    portalRoot
  );
}
