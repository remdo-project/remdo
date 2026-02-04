import { registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import { $getNearestNodeFromDOMNode } from 'lexical';
import { useEffect } from 'react';

import { $getNoteId } from '#lib/editor/note-id-state';
import { ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';
import { isBulletHit } from '@/editor/outline/bullet-hit-test';
import { findNearestListItem, getContentListItem, isChildrenWrapper } from '@/editor/outline/list-structure';

const isChecklistItem = (element: HTMLElement): boolean =>
  element.classList.contains('list-item-checked') || element.classList.contains('list-item-unchecked');

const registerChecklistBulletZoomGuard = (editor: LexicalEditor) => {
  const handleChecklistPointerDown = (event: PointerEvent | MouseEvent) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const listItem = event.target.closest<HTMLElement>('li.list-item');
    if (!listItem || !isChecklistItem(listItem)) {
      return;
    }
    if (!isBulletHit(listItem, event as PointerEvent)) {
      return;
    }
    const noteId = editor.read(() => {
      const node = $getNearestNodeFromDOMNode(listItem);
      if (!node) {
        return null;
      }
      const listNode = findNearestListItem(node);
      if (!listNode || isChildrenWrapper(listNode)) {
        return null;
      }
      const contentItem = getContentListItem(listNode);
      return $getNoteId(contentItem);
    });
    if (!noteId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    editor.dispatchCommand(ZOOM_TO_NOTE_COMMAND, { noteId });
  };

  const handleChecklistClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const listItem = event.target.closest<HTMLElement>('li.list-item');
    if (!listItem || !isChecklistItem(listItem)) {
      return;
    }
    if (!isBulletHit(listItem, event as PointerEvent)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return editor.registerRootListener((rootElement, prevElement) => {
    if (rootElement) {
      rootElement.addEventListener('pointerdown', handleChecklistPointerDown);
      rootElement.addEventListener('click', handleChecklistClick);
    }
    if (prevElement) {
      prevElement.removeEventListener('pointerdown', handleChecklistPointerDown);
      prevElement.removeEventListener('click', handleChecklistClick);
    }
  });
};

export function CheckListPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => mergeRegister(registerChecklistBulletZoomGuard(editor), registerCheckList(editor)), [editor]);

  return null;
}
