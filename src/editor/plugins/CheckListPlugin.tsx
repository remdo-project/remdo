import { $isListItemNode, $isListNode, ListItemNode, ListNode, registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import { $getNearestNodeFromDOMNode, $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { useEffect } from 'react';

import { $getNoteChecked, $setNoteCheckedRaw } from '#lib/editor/checklist-state';
import { SET_NOTE_CHECKED_COMMAND, ZOOM_TO_NOTE_COMMAND } from '@/editor/commands';
import type { SetNoteCheckedPayload } from '@/editor/commands';
import { isBulletHit, isCheckboxHit } from '@/editor/outline/bullet-hit-test';
import { $resolveNoteIdFromDOMNode } from '@/editor/outline/note-context';
import { requireContentItemFromNode, resolveContentItemFromNode } from '@/editor/outline/schema';
import { getParentContentItem, getSubtreeItems } from '@/editor/outline/selection/tree';
import { installOutlineSelectionHelpers } from '@/editor/outline/selection/store';

const isChecklistItem = (element: HTMLElement): boolean =>
  element.classList.contains('list-item-checked') || element.classList.contains('list-item-unchecked');

const $resolveContentItemByKey = (key: string): ListItemNode | null => {
  const node = $getNodeByKey<ListItemNode>(key);
  return node ? requireContentItemFromNode(node) : null;
};

const $setNoteCheckedForSingleNode = (node: ListItemNode, checked: boolean) => {
  $setNoteCheckedRaw(node, checked);
  const parent = node.getParent();
  if ($isListNode(parent) && parent.getListType() === 'check') {
    node.setChecked(checked);
  }
};

// User-facing checklist actions always apply to a subtree so descendants match
// the toggled root.
const $setNoteCheckedRecursively = (node: ListItemNode, checked: boolean) => {
  for (const item of getSubtreeItems(node)) {
    $setNoteCheckedForSingleNode(item, checked);
  }
};

const $resolveRootTargetsFromKeys = (keys: string[]): ListItemNode[] => {
  const ordered: ListItemNode[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const item = $resolveContentItemByKey(key);
    if (item) {
      ordered.push(item);
    }
  }

  const selectedKeys = new Set(ordered.map((item) => item.getKey()));
  return ordered.filter((item) => {
    let parent = getParentContentItem(item);
    while (parent) {
      if (selectedKeys.has(parent.getKey())) {
        return false;
      }
      parent = getParentContentItem(parent);
    }
    return true;
  });
};

const $resolveToggleTargets = (
  editor: LexicalEditor,
  payload: SetNoteCheckedPayload
): ListItemNode[] => {
  if (payload.noteItemKey) {
    const item = $resolveContentItemByKey(payload.noteItemKey);
    return item ? [item] : [];
  }

  const outlineSelection = editor.selection.get();
  if (outlineSelection?.kind === 'structural') {
    const keys = outlineSelection.headKeys.length > 0 ? outlineSelection.headKeys : outlineSelection.selectedKeys;
    const targets = $resolveRootTargetsFromKeys(keys);
    if (targets.length > 0) {
      return targets;
    }
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return [];
  }
  const contentItem = resolveContentItemFromNode(selection.focus.getNode()) ??
    resolveContentItemFromNode(selection.anchor.getNode());
  if (!contentItem) {
    return [];
  }
  return [contentItem];
};

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
      const noteId = editor.read(() => $resolveNoteIdFromDOMNode(listItem));
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
        $setNoteCheckedRecursively(node, !$getNoteChecked(node));
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
    installOutlineSelectionHelpers(editor);

    const listTypeByKey = new Map<string, string>();

    return mergeRegister(
      registerChecklistBulletZoomGuard(editor),
      registerCheckList(editor),
      editor.registerCommand(
        SET_NOTE_CHECKED_COMMAND,
        (payload) => {
          const targets = $resolveToggleTargets(editor, payload);
          if (targets.length === 0) {
            return false;
          }
          const state = payload.state;

          if (state === 'checked' || state === 'unchecked') {
            const targetState = state === 'checked';
            for (const target of targets) {
              $setNoteCheckedRecursively(target, targetState);
            }
            return true;
          }

          if (targets.length === 1) {
            const single = targets[0]!;
            const target = !$getNoteChecked(single);
            $setNoteCheckedRecursively(single, target);
            return true;
          }

          const allChecked = targets.every((target) => $getNoteChecked(target) === true);
          const targetState = !allChecked;
          for (const target of targets) {
            $setNoteCheckedRecursively(target, targetState);
          }
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
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
        if (current !== stored && (current || stored !== undefined)) {
          $setNoteCheckedRaw(node, current);
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
