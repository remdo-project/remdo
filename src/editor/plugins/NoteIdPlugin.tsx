import { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $setState } from 'lexical';
import { useEffect, useRef } from 'react';
import { createNoteId } from '#lib/editor/note-ids';
import { $getNoteId, noteIdState } from '#lib/editor/note-id-state';
import { isChildrenWrapper } from '@/editor/outline/list-structure';
import { useCollaborationStatus } from './collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';

function $ensureNoteId(item: ListItemNode) {
  if (isChildrenWrapper(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createNoteId());
}

export function NoteIdPlugin() {
  const [editor] = useLexicalComposerContext();
  const { hydrated, docEpoch, docId } = useCollaborationStatus();
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = true;

    if (hydrated) {
      editor.update(() => {
        $normalizeNoteIdsOnLoad($getRoot(), docId);
      });
    }

    const unregister = editor.registerNodeTransform(ListItemNode, (node) => {
      if (!readyRef.current) {
        return;
      }
      $ensureNoteId(node);
    });

    return () => {
      unregister();
    };
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
