import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNearestNodeFromDOMNode, $getSelection, $isRangeSelection } from 'lexical';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { $isNoteFolded } from '#lib/editor/fold-state';
import { OPEN_NOTE_MENU_COMMAND, TOGGLE_NOTE_FOLD_COMMAND } from '@/editor/commands';
import { findNearestListItem, getContentListItem, getContentSiblings, isChildrenWrapper } from '@/editor/outline/list-structure';
import { getNestedList } from '@/editor/outline/selection/tree';

interface NoteControlsState {
  noteKey: string;
  hasChildren: boolean;
  isFolded: boolean;
  left: number;
  top: number;
  fontSize?: string;
  controlSize?: string;
  controlGap?: string;
}

interface NoteControlsLayout
  extends Pick<NoteControlsState, 'left' | 'top' | 'fontSize' | 'controlSize' | 'controlGap'> {}

type InteractionSource = 'hover' | 'caret';

const noteHasChildren = (item: ListItemNode): boolean => {
  const nested = getNestedList(item);
  if (!nested) {
    return false;
  }
  return getContentSiblings(nested).length > 0;
};

const resolveTargetByY = (root: HTMLElement, clientY: number): HTMLElement | null => {
  const items = root.querySelectorAll<HTMLElement>('li.list-item:not(.list-nested-item)');
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return item;
    }
  }
  return null;
};

export function NoteControlsPlugin() {
  const [editor] = useLexicalComposerContext();
  const rootRef = useRef<HTMLElement | null>(editor.getRootElement());
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() => {
    const root = editor.getRootElement();
    return root ? root.closest<HTMLElement>('.editor-container') : null;
  });
  const [controls, setControls] = useState<NoteControlsState | null>(null);
  const hoverElementRef = useRef<HTMLElement | null>(null);
  const interactionSourceRef = useRef<InteractionSource>('hover');

  const resolveLayout = (
    element: HTMLElement,
    root: HTMLElement,
    anchor: HTMLElement
  ): NoteControlsLayout | null => {
    if (!root.contains(element)) {
      return null;
    }
    const style = globalThis.getComputedStyle(element);
    const fontSizeValue = style.fontSize.trim();
    const fontSize = fontSizeValue.length > 0 ? fontSizeValue : undefined;
    const controlSizeValue = style.getPropertyValue('--fold-toggle-size').trim();
    const controlGapValue = style.getPropertyValue('--fold-toggle-gap').trim();
    const controlSize = controlSizeValue.length > 0 ? controlSizeValue : undefined;
    const controlGap = controlGapValue.length > 0 ? controlGapValue : undefined;
    const rect = element.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const left = rect.left - anchorRect.left + root.scrollLeft;
    const top = rect.top - anchorRect.top + root.scrollTop + rect.height / 2;
    return { left, top, fontSize, controlSize, controlGap };
  };

  useEffect(() => {
    const resolveNoteState = (
      element: HTMLElement
    ): { noteKey: string; hasChildren: boolean; isFolded: boolean } | null => {
      let result: { noteKey: string; hasChildren: boolean; isFolded: boolean } | null = null;
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
        result = {
          noteKey: contentItem.getKey(),
          hasChildren,
          isFolded: hasChildren && $isNoteFolded(contentItem),
        };
      });
      return result;
    };

    const resolveSelectionKey = (): string | null => {
      let key: string | null = null;
      editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        const focusItem =
          findNearestListItem(selection.focus.getNode()) ??
          findNearestListItem(selection.anchor.getNode());
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

    const resolveSelectionElement = (root: HTMLElement): HTMLElement | null => {
      const key = resolveSelectionKey();
      if (!key) {
        return null;
      }
      const element = editor.getElementByKey(key);
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      if (!root.contains(element)) {
        return null;
      }
      return element;
    };

    const clearControls = () => {
      setControls(null);
    };

    const syncControlsForElement = (element: HTMLElement, root: HTMLElement, anchor: HTMLElement) => {
      const noteState = resolveNoteState(element);
      if (!noteState) {
        clearControls();
        return;
      }
      const layout = resolveLayout(element, root, anchor);
      if (!layout) {
        clearControls();
        return;
      }
      setControls({ ...layout, ...noteState });
    };

    const syncActiveControls = () => {
      const root = rootRef.current ?? editor.getRootElement();
      const anchor = root ? root.closest<HTMLElement>('.editor-container') : null;
      if (!root || !anchor) {
        clearControls();
        return;
      }

      const hoverElement = hoverElementRef.current;
      if (hoverElement && !root.contains(hoverElement)) {
        hoverElementRef.current = null;
      }

      let selectionElement: HTMLElement | null = null;
      let active: HTMLElement | null = null;
      if (interactionSourceRef.current === 'hover') {
        active = hoverElementRef.current;
        if (!active) {
          selectionElement = resolveSelectionElement(root);
          active = selectionElement;
        }
      } else {
        selectionElement = resolveSelectionElement(root);
        active = selectionElement ?? hoverElementRef.current;
      }

      if (!active) {
        clearControls();
        return;
      }
      syncControlsForElement(active, root, anchor);
    };

    const setInteractionSource = (source: InteractionSource): boolean => {
      if (interactionSourceRef.current === source) {
        return false;
      }
      interactionSourceRef.current = source;
      return true;
    };

    const handlePointerMove = (event: PointerEvent | MouseEvent) => {
      const root = rootRef.current ?? editor.getRootElement();
      if (!root) {
        clearControls();
        return;
      }
      const eventTarget = event.target;
      if (eventTarget instanceof HTMLElement && eventTarget.closest('[data-note-menu]')) {
        return;
      }
      const surfaceRect = root.getBoundingClientRect();
      if (
        event.clientX < surfaceRect.left ||
        event.clientX > surfaceRect.right ||
        event.clientY < surfaceRect.top ||
        event.clientY > surfaceRect.bottom
      ) {
        return;
      }

      if (hoverElementRef.current) {
        const rect = hoverElementRef.current.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          const sourceChanged = setInteractionSource('hover');
          if (sourceChanged) {
            syncActiveControls();
          }
          return;
        }
      }

      const candidate =
        eventTarget instanceof HTMLElement
          ? eventTarget.closest<HTMLElement>('li.list-item:not(.list-nested-item)')
          : null;
      const nextHover = candidate ?? resolveTargetByY(root, event.clientY);

      if (!nextHover) {
        return;
      }

      const sourceChanged = setInteractionSource('hover');
      if (nextHover === hoverElementRef.current) {
        if (sourceChanged) {
          syncActiveControls();
        }
        return;
      }

      hoverElementRef.current = nextHover;
      syncActiveControls();
    };

    const handleScroll = () => {
      syncActiveControls();
    };

    const handleResize = () => {
      syncActiveControls();
    };

    const handleKeyDown = () => {
      const sourceChanged = setInteractionSource('caret');
      if (sourceChanged) {
        syncActiveControls();
      }
    };

    let currentRoot = rootRef.current ?? editor.getRootElement();
    if (currentRoot) {
      rootRef.current = currentRoot;
      currentRoot.addEventListener('scroll', handleScroll);
      currentRoot.addEventListener('keydown', handleKeyDown);
    }

    document.addEventListener('pointermove', handlePointerMove);

    const unregisterRootListener = editor.registerRootListener((nextRoot, previousRoot) => {
      if (previousRoot) {
        previousRoot.removeEventListener('scroll', handleScroll);
        previousRoot.removeEventListener('keydown', handleKeyDown);
      }
      currentRoot = nextRoot;
      rootRef.current = nextRoot;
      setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      if (currentRoot) {
        currentRoot.addEventListener('scroll', handleScroll);
        currentRoot.addEventListener('keydown', handleKeyDown);
      }
      syncActiveControls();
    });

    const unregisterUpdate = editor.registerUpdateListener(() => {
      syncActiveControls();
    });

    globalThis.addEventListener('resize', handleResize);

    return () => {
      unregisterRootListener();
      unregisterUpdate();
      globalThis.removeEventListener('resize', handleResize);
      document.removeEventListener('pointermove', handlePointerMove);
      if (currentRoot) {
        currentRoot.removeEventListener('scroll', handleScroll);
        currentRoot.removeEventListener('keydown', handleKeyDown);
      }
      clearControls();
    };
  }, [editor]);

  if (!portalRoot || !controls) {
    return null;
  }
  const style: CSSProperties & {
    '--note-control-size'?: string;
    '--note-control-gap'?: string;
  } = {
    left: controls.left,
    top: controls.top,
  };
  if (controls.fontSize) {
    style.fontSize = controls.fontSize;
  }
  if (controls.controlSize) {
    style['--note-control-size'] = controls.controlSize;
  }
  if (controls.controlGap) {
    style['--note-control-gap'] = controls.controlGap;
  }

  const onMenuPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const container = button.closest<HTMLElement>('.editor-container');
    if (!container) {
      editor.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteKey: controls.noteKey });
      editor.focus();
      return;
    }
    const rect = button.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const anchor = {
      left: rect.right - containerRect.left,
      top: rect.top - containerRect.top + rect.height / 2,
    };
    editor.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteKey: controls.noteKey, anchor });
    editor.focus();
  };

  const onFoldPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    editor.dispatchCommand(TOGGLE_NOTE_FOLD_COMMAND, { noteKey: controls.noteKey });
    editor.focus();
  };

  return createPortal(
    <div className="note-controls-layer" contentEditable={false} aria-hidden="true">
      <div
        className="note-controls"
        style={style}
      >
        <button
          type="button"
          className="note-controls__button note-controls__button--menu"
          onPointerDown={onMenuPointerDown}
          aria-label="Open note menu"
        />
        {controls.hasChildren ? (
          <button
            type="button"
            className={
              controls.isFolded
                ? 'note-controls__button note-controls__button--folded'
                : 'note-controls__button note-controls__button--expanded'
            }
            onPointerDown={onFoldPointerDown}
            aria-label={controls.isFolded ? 'Expand note' : 'Collapse note'}
          />
        ) : null}
      </div>
    </div>,
    portalRoot
  );
}
