import { $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list';
import type { ListNode as ListNodeType } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, mergeRegister } from 'lexical';
import { useEffect } from 'react';

import { getContentSiblings } from '#client/editor/outline/list-structure';
import { NoteCheckedDisplayCache } from './checked-subtree';
import { $getNoteMarker, $hasNoteCheckbox } from './note-marker';

function setData(element: HTMLElement, key: string, value: string | undefined): void {
  if (value === undefined) {
    delete element.dataset[key];
  } else if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

const ARIA_CHECKED = { checked: 'true', mixed: 'mixed', unchecked: 'false' } as const;

function $syncCheckbox(
  element: HTMLElement,
  note: ListItemNode,
  list: ListNodeType,
  displays: NoteCheckedDisplayCache
): void {
  if (!$hasNoteCheckbox(note)) {
    delete element.dataset.checkbox;
    element.removeAttribute('role');
    element.removeAttribute('tabindex');
    element.removeAttribute('aria-checked');
    return;
  }
  element.dataset.checkbox = 'true';
  // Lexical gives only a check list's notes checkbox semantics, and resets them when it reconciles.
  if (list.getListType() !== 'check') {
    element.setAttribute('role', 'checkbox');
    element.setAttribute('tabindex', '-1');
    element.setAttribute('aria-checked', ARIA_CHECKED[displays.get(note)]);
  }
}

function $syncList(editor: LexicalEditor, list: ListNodeType, displays: NoteCheckedDisplayCache): void {
  let previous: number | null = null;
  for (const note of getContentSiblings(list)) {
    const [type, detail] = $getNoteMarker(note).split(':');
    const number: number | null = type === 'number' ? (detail === undefined ? (previous ?? 0) + 1 : Number(detail)) : null;
    previous = number;
    const element = editor.getElementByKey(note.getKey());
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    setData(element, 'marker', type);
    setData(element, 'number', number === null ? undefined : String(number));
    setData(element, 'headingLevel', type === 'heading' ? detail : undefined);
    $syncCheckbox(element, note, list, displays);
  }
}

export function NoteMarkerPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const syncLists = (keys: Iterable<string>, listOf: (key: string) => ListNodeType | null) => {
      editor.getEditorState().read(() => {
        const lists = new Map<string, ListNodeType>();
        for (const key of keys) {
          const list = listOf(key);
          if (list?.isAttached()) {
            lists.set(list.getKey(), list);
          }
        }
        const displays = new NoteCheckedDisplayCache();
        for (const list of lists.values()) {
          $syncList(editor, list, displays);
        }
      });
    };

    return mergeRegister(
      editor.registerMutationListener(ListItemNode, (mutations) => {
        syncLists(mutations.keys(), (key) => {
          const node = $getNodeByKey(key);
          const parent = $isListItemNode(node) ? node.getParent() : null;
          return $isListNode(parent) ? parent : null;
        });
      }),
      editor.registerMutationListener(ListNode, (mutations) => {
        syncLists(mutations.keys(), (key) => {
          const node = $getNodeByKey(key);
          return $isListNode(node) ? node : null;
        });
      })
    );
  }, [editor]);

  return null;
}
