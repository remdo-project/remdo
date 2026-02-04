import type { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNearestNodeFromDOMNode } from 'lexical';
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

    const clearHover = () => {
      hoverElementRef.current = null;
      setControls(null);
    };

    const syncHover = () => {
      const root = rootRef.current ?? editor.getRootElement();
      const anchor = root ? root.closest<HTMLElement>('.editor-container') : null;
      const element = hoverElementRef.current;
      if (!root || !anchor || !element) {
        clearHover();
        return;
      }
      const noteState = resolveNoteState(element);
      if (!noteState) {
        clearHover();
        return;
      }
      const layout = resolveLayout(element, root, anchor);
      if (!layout) {
        clearHover();
        return;
      }
      setControls({ ...layout, ...noteState });
    };

    const handlePointerMove = (event: PointerEvent | MouseEvent) => {
      const root = rootRef.current ?? editor.getRootElement();
      if (!root) {
        clearHover();
        return;
      }
      const surfaceRect = root.getBoundingClientRect();
      if (
        event.clientX < surfaceRect.left ||
        event.clientX > surfaceRect.right ||
        event.clientY < surfaceRect.top ||
        event.clientY > surfaceRect.bottom
      ) {
        clearHover();
        return;
      }

      if (hoverElementRef.current) {
        const rect = hoverElementRef.current.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          return;
        }
      }

      const eventTarget = event.target;
      const candidate =
        eventTarget instanceof HTMLElement
          ? eventTarget.closest<HTMLElement>('li.list-item:not(.list-nested-item)')
          : null;
      const nextHover = candidate ?? resolveTargetByY(root, event.clientY);

      if (nextHover === hoverElementRef.current) {
        return;
      }
      hoverElementRef.current = nextHover;
      if (!nextHover) {
        clearHover();
        return;
      }
      syncHover();
    };

    const handleScroll = () => {
      if (hoverElementRef.current) {
        syncHover();
      }
    };

    const handleResize = () => {
      if (hoverElementRef.current) {
        syncHover();
      }
    };

    let currentRoot = rootRef.current ?? editor.getRootElement();
    if (currentRoot) {
      rootRef.current = currentRoot;
      currentRoot.addEventListener('scroll', handleScroll);
    }

    document.addEventListener('pointermove', handlePointerMove);

    const unregisterRootListener = editor.registerRootListener((nextRoot, previousRoot) => {
      if (previousRoot) {
        previousRoot.removeEventListener('scroll', handleScroll);
      }
      currentRoot = nextRoot;
      rootRef.current = nextRoot;
      setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
      if (currentRoot) {
        currentRoot.addEventListener('scroll', handleScroll);
      }
      syncHover();
    });

    const unregisterUpdate = editor.registerUpdateListener(() => {
      if (hoverElementRef.current) {
        syncHover();
      }
    });

    globalThis.addEventListener('resize', handleResize);

    return () => {
      unregisterRootListener();
      unregisterUpdate();
      globalThis.removeEventListener('resize', handleResize);
      document.removeEventListener('pointermove', handlePointerMove);
      if (currentRoot) {
        currentRoot.removeEventListener('scroll', handleScroll);
      }
      clearHover();
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
    editor.dispatchCommand(OPEN_NOTE_MENU_COMMAND, { noteKey: controls.noteKey });
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
