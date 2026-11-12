import { $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list';
import type { ListNode as ListNodeType } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';
import { $getNodeByKey, mergeRegister } from 'lexical';
import { useEffect } from 'react';

import { getContentSiblings } from '#client/editor/outline/list-structure';
import { NoteCheckedDisplayCache } from './checked-subtree';
import { $noteMarkerViews } from './note-marker';

function setData(element: HTMLElement, key: string, value: string | undefined): void {
  if (value === undefined) {
    delete element.dataset[key];
  } else if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

const ARIA_CHECKED = { checked: 'true', mixed: 'mixed', unchecked: 'false' } as const;

function $syncList(editor: LexicalEditor, list: ListNodeType, displays: NoteCheckedDisplayCache): void {
  const notes = getContentSiblings(list);
  $noteMarkerViews(notes).forEach((view, index) => {
    const note = notes[index]!;
    const element = editor.getElementByKey(note.getKey());
    if (!(element instanceof HTMLElement)) {
      return;
    }
    setData(element, 'marker', view.kind);
    setData(element, 'number', view.number === null ? undefined : String(view.number));
    setData(element, 'headingLevel', view.headingLevel === null ? undefined : String(view.headingLevel));
    setData(element, 'checkbox', view.checkbox ? 'true' : undefined);
    // Lexical gives only a check list's notes checkbox semantics, and resets them when it reconciles.
    if (list.getListType() === 'check') {
      return;
    }
    if (view.checkbox) {
      element.setAttribute('role', 'checkbox');
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-checked', ARIA_CHECKED[displays.get(note)]);
    } else {
      element.removeAttribute('role');
      element.removeAttribute('tabindex');
      element.removeAttribute('aria-checked');
    }
  });
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
