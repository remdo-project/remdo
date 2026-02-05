import { $isListItemNode, $isListNode, ListItemNode, ListNode, registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import { $getNearestNodeFromDOMNode, $getNodeByKey } from 'lexical';
import { useEffect } from 'react';

import { $getNoteChecked, $setNoteChecked } from '#lib/editor/checklist-state';
import { $getNoteId } from '#lib/editor/note-id-state';
import { ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';
import { isBulletHit, isCheckboxHit } from '@/editor/outline/bullet-hit-test';
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
    if (isBulletHit(listItem, event as PointerEvent)) {
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
      return;
    }
    if (isCheckboxHit(listItem, event as PointerEvent)) {
      event.preventDefault();
    }
  };

  const handleChecklistClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const listItem = event.target.closest<HTMLElement>('li.list-item');
    if (!listItem || !isChecklistItem(listItem)) {
      return;
    }
    if (isBulletHit(listItem, event as PointerEvent)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (!isCheckboxHit(listItem, event as PointerEvent)) {
      return;
    }
    if (!editor.isEditable()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(listItem);
      if ($isListItemNode(node)) {
        listItem.focus();
        node.toggleChecked();
        $setNoteChecked(node, node.getChecked());
      }
    });
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

  useEffect(() => {
    const listTypeByKey = new Map<string, string>();

    return mergeRegister(
      registerChecklistBulletZoomGuard(editor),
      registerCheckList(editor),
      editor.registerNodeTransform(ListNode, (node) => {
        const key = node.getKey();
        if (!node.isAttached()) {
          listTypeByKey.delete(key);
          return;
        }
        const prevType = listTypeByKey.get(key);
        const nextType = node.getListType();
        if (prevType === nextType) {
          return;
        }
        listTypeByKey.set(key, nextType);

        if (nextType === 'check') {
          for (const child of node.getChildren()) {
            if ($isListItemNode(child)) {
              const stored = $getNoteChecked(child);
              if (stored !== undefined) {
                child.setChecked(stored);
              }
            }
          }
        }
      }),
      editor.registerNodeTransform(ListItemNode, (node) => {
        const parent = node.getParent();
        if (!$isListNode(parent)) {
          return;
        }
        if (parent.getListType() !== 'check') {
          return;
        }
        const current = node.getChecked();
        const stored = $getNoteChecked(node);
        if (current !== stored) {
          $setNoteChecked(node, current);
        }
      }),
      editor.registerUpdateListener(({ editorState, dirtyElements }) => {
        editorState.read(() => {
          for (const key of dirtyElements.keys()) {
            const node = $getNodeByKey(key);
            if (!$isListItemNode(node)) {
              continue;
            }
            const element = editor.getElementByKey(key);
            if (!(element instanceof HTMLElement)) {
              continue;
            }
            const checked = $getNoteChecked(node);
            if (checked) {
              element.dataset.noteChecked = 'true';
            } else {
              delete element.dataset.noteChecked;
            }
          }
        });
      })
    );
  }, [editor]);

  return null;
}
