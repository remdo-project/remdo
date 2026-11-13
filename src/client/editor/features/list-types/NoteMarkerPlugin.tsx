import { $isListNode, ListItemNode, ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, mergeRegister } from 'lexical';
import { useEffect } from 'react';

import { $getListItemByKey, getContentSiblings } from '#client/editor/outline/list-structure';
import { noteMarkerAttributes } from '#client/editor/outline/note-marker-attributes';
import { $noteMarkerViews, setAttributes } from './note-marker';

/** Numbers notes, which depend on their siblings; each note's other marker attributes are written
 *  as Lexical renders it. */
export function NoteMarkerPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const syncLists = (keys: Iterable<string>, $listOf: (key: string) => ListNode | null) => {
      editor.getEditorState().read(() => {
        const lists = new Map<string, ListNode>();
        for (const key of keys) {
          const list = $listOf(key);
          if (list?.isAttached()) {
            lists.set(list.getKey(), list);
          }
        }
        for (const list of lists.values()) {
          const notes = getContentSiblings(list);
          $noteMarkerViews(notes).forEach((view, index) => {
            const element = editor.getElementByKey(notes[index]!.getKey());
            if (element instanceof HTMLElement) {
              setAttributes(element, { 'data-number': noteMarkerAttributes(view)['data-number'] });
            }
          });
        }
      });
    };

    return mergeRegister(
      editor.registerMutationListener(ListItemNode, (mutations) => {
        syncLists(mutations.keys(), (key) => {
          const list = $getListItemByKey(key)?.getParent();
          return $isListNode(list) ? list : null;
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
