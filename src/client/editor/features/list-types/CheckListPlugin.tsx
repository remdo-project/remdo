import { $isListItemNode, $isListNode, ListItemNode, ListNode, registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { $getNearestNodeFromDOMNode, $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, mergeRegister } from 'lexical';
import { useEffect } from 'react';

import { $setNoteCheckedRecursively, $toggleNoteCheckedForTargets } from './checked-operations';
import { $isInCheckList } from './note-marker';
import { $getNoteChecked, $setNoteCheckedRaw } from '#client/editor/features/list-types/checked-state';
import { SET_NOTE_CHECKED_COMMAND, ZOOM_TO_NOTE_COMMAND } from '#client/editor/foundation/commands';
import type { SetNoteCheckedPayload } from '#client/editor/foundation/commands';
import { isBulletHit, isCheckboxHit } from '#client/editor/outline/bullet-hit-test';
import { $resolveNoteIdFromDOMNode } from '#client/editor/outline/note-context';
import { $getSelectionBody, $resolveNoteForSelectionPoint } from '#client/editor/outline/selection/body-region';
import { $resolveStructuralItemsFromRange } from '#client/editor/outline/selection/range';
import { requireContentItemFromNode, resolveContentItemFromNode } from '#client/editor/outline/schema';
import { getParentContentItem } from '#client/editor/outline/selection/tree';
import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';
import { $resolveViewRoot } from '#client/editor/outline/view-root';

const isChecklistItem = (element: HTMLElement): boolean => element.dataset.checkbox === 'true';

const $resolveContentItemByKey = (key: string): ListItemNode | null => {
  const node = $getNodeByKey(key);
  return node ? requireContentItemFromNode(node) : null;
};

const $resolveRootTargets = (items: ListItemNode[]): ListItemNode[] => {
  const ordered: ListItemNode[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.getKey();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(item);
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
  const outlineSelection = editor.selection.get();
  const selectedItems = outlineSelection?.kind === 'structural' && outlineSelection.range
    ? $resolveStructuralItemsFromRange(outlineSelection.range)
    : [];

  if (payload.noteItemKey) {
    const item = $resolveContentItemByKey(payload.noteItemKey);
    if (!item) {
      return [];
    }
    return selectedItems.some((selected) => selected.is(item)) ? $resolveRootTargets(selectedItems) : [item];
  }

  if (selectedItems.length > 0) {
    return $resolveRootTargets(selectedItems);
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return [];
  }
  const contentItem = $resolveNoteForSelectionPoint(selection.focus.getNode()) ??
    $resolveNoteForSelectionPoint(selection.anchor.getNode());
  if (!contentItem || (!$getSelectionBody(selection) && $resolveViewRoot(editor)?.is(contentItem))) {
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
      const clicked = $isListItemNode(node) ? resolveContentItemFromNode(node) : null;
      if (!clicked) {
        return;
      }
      // A marker click targets the selected range only from inside it; outside
      // any structural selection it targets the clicked note alone. Resolved
      // before focusing so the targets never depend on that DOM mutation.
      const outlineSelection = editor.selection.get();
      const selectedItems = outlineSelection?.kind === 'structural' && outlineSelection.range
        ? $resolveStructuralItemsFromRange(outlineSelection.range)
        : [];
      const targets = selectedItems.some((item) => item.is(clicked))
        ? $resolveRootTargets(selectedItems)
        : [clicked];

      // Lexical's checklist keys act only on a check list's focused item; elsewhere focus moves to
      // the editor, keeping its caret, so typing never lands in a field focused before the click.
      const root = editor.getRootElement();
      if ($isInCheckList(clicked)) {
        listItem.focus();
      } else if (root && !root.contains(document.activeElement)) {
        root.focus({ preventScroll: true });
      }
      $toggleNoteCheckedForTargets(targets);
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

          $toggleNoteCheckedForTargets(targets);
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
    );
  }, [editor]);

  return null;
}
