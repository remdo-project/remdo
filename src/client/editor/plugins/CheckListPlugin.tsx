import { $isListItemNode, $isListNode, ListItemNode, ListNode, registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import type { LexicalEditor } from 'lexical';
import { $getNearestNodeFromDOMNode, $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { useEffect } from 'react';

import type { NoteCheckedDisplay } from '#client/editor/runtime/checklist-state';
import { $getNoteChecked, $isNoteSubtreeChecked, $setNoteCheckedRaw, NoteCheckedDisplayCache } from '#client/editor/runtime/checklist-state';
import { SET_NOTE_CHECKED_COMMAND, ZOOM_TO_NOTE_COMMAND } from '#client/editor/commands';
import type { SetNoteCheckedPayload } from '#client/editor/commands';
import { isBulletHit, isCheckboxHit } from '#client/editor/outline/bullet-hit-test';
import { isContentItem } from '#client/editor/outline/list-structure';
import { $resolveNoteIdFromDOMNode } from '#client/editor/outline/note-context';
import { $resolveStructuralItemsFromRange } from '#client/editor/outline/selection/range';
import { requireContentItemFromNode, resolveContentItemFromNode } from '#client/editor/outline/schema';
import { getParentContentItem, getSubtreeItems, getWrapperForContent } from '#client/editor/outline/selection/tree';
import { installOutlineSelectionHelpers } from '#client/editor/outline/selection/store';

// A body-wrapper renders as `.note-body-wrapper`, never a checklist `<li>`, so it
// is naturally excluded here — no body-specific guard needed.
const isChecklistItem = (element: HTMLElement): boolean =>
  element.classList.contains('list-item-checked') || element.classList.contains('list-item-unchecked');

const ARIA_CHECKED_BY_DISPLAY: Record<NoteCheckedDisplay, string> = {
  checked: 'true',
  mixed: 'mixed',
  unchecked: 'false',
};

const $syncNoteCheckedDataset = (
  editor: LexicalEditor,
  node: ListItemNode,
  display: NoteCheckedDisplay
): void => {
  const element = editor.getElementByKey(node.getKey());
  if (!(element instanceof HTMLElement)) {
    return;
  }
  // `data-note-checked` reports the note's own completion, so a note the user
  // checked keeps reading as done regardless of what is later moved under it.
  if ($getNoteChecked(node) === true) {
    element.dataset.noteChecked = 'true';
  } else {
    delete element.dataset.noteChecked;
  }
  // `data-note-subtree` reports the subtree, which drives the mixed marker.
  if (display === 'mixed') {
    element.dataset.noteSubtree = 'mixed';
  } else {
    delete element.dataset.noteSubtree;
  }
  // A note's children live in a sibling wrapper, so the wrapper carries the
  // "everything in here sits under a checked note" flag and CSS dims the
  // unchecked notes within it at any depth.
  const wrapper = getWrapperForContent(node);
  const wrapperElement = wrapper ? editor.getElementByKey(wrapper.getKey()) : null;
  if (wrapperElement instanceof HTMLElement) {
    if ($getNoteChecked(node) === true) {
      wrapperElement.dataset.noteUnderChecked = 'true';
    } else {
      delete wrapperElement.dataset.noteUnderChecked;
    }
  }
  // Lexical writes a binary aria-checked from the item's own checked flag while
  // reconciling a check-type list; a mixed subtree needs the third ARIA value.
  if (element.getAttribute('role') === 'checkbox') {
    element.setAttribute('aria-checked', ARIA_CHECKED_BY_DISPLAY[display]);
  }
};

const $resolveContentItemByKey = (key: string): ListItemNode | null => {
  const node = $getNodeByKey(key);
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

// Toggling is one decision over the whole target set: it unchecks only when
// every target is already complete. Shared so each toggling surface agrees.
const $toggleNoteCheckedForTargets = (targets: ListItemNode[]) => {
  const allChecked = targets.every((target) => $isNoteSubtreeChecked(target));
  for (const target of targets) {
    $setNoteCheckedRecursively(target, !allChecked);
  }
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
  if (payload.noteItemKey) {
    const item = $resolveContentItemByKey(payload.noteItemKey);
    return item ? [item] : [];
  }

  const outlineSelection = editor.selection.get();
  if (outlineSelection?.kind === 'structural' && outlineSelection.range) {
    const targets = $resolveRootTargets($resolveStructuralItemsFromRange(outlineSelection.range));
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

      listItem.focus();
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
      editor.registerMutationListener(
        ListItemNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            // A mutated note changes its ancestors' subtree state, and Lexical
            // does not report an ancestor as mutated when only a descendant
            // changed, so each mutated note's ancestor chain resyncs too.
            // Descendants need no walk: dimming hangs off the children-wrapper,
            // and a recursive write marks every note it touches as mutated.
            const mutated: ListItemNode[] = [];
            for (const [key, mutation] of mutations) {
              if (mutation === 'destroyed') {
                // A destroyed note has no ancestors to walk. Its former parent
                // still resyncs, because removing a note dirties its siblings
                // and its wrapper's owner.
                continue;
              }
              // Wrappers are ListItemNodes too, and a body wrapper's next
              // sibling is the owning note's children wrapper — syncing one as
              // if it were a note would clear that wrapper's open-work flag.
              const node = $getNodeByKey(key);
              if (isContentItem(node)) {
                mutated.push(node);
              }
            }

            const pending = new Map<string, ListItemNode>();
            for (const node of mutated) {
              for (let item: ListItemNode | null = node; item; item = getParentContentItem(item)) {
                pending.set(item.getKey(), item);
              }
            }

            const displays = new NoteCheckedDisplayCache();
            for (const node of pending.values()) {
              $syncNoteCheckedDataset(editor, node, displays.get(node));
            }
          });
        }
      )
    );
  }, [editor]);

  return null;
}
