import { ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $hasUpdateTag, $setState } from 'lexical';
import { useEffect, useRef } from 'react';
import { mergeRegister } from '@lexical/utils';
import { createUniqueNoteId } from '#domain/notes/ids';
import { $getNoteId, noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { isWrapperItem } from '#client/editor/outline/list-structure';
import { useCollaborationStatus } from '#client/editor/runtime/collaboration';
import { $normalizeNoteIdsOnLoad } from './note-id-normalization';
import { NOTE_ID_NORMALIZE_TAG, TEST_BRIDGE_LOAD_TAG } from '#client/editor/foundation/update-tags';

function $ensureNoteId(item: ListItemNode) {
  // Adjacency wrappers (children-wrapper, body-wrapper) are not notes.
  if (isWrapperItem(item) || $getNoteId(item)) {
    return;
  }

  $setState(item, noteIdState, createUniqueNoteId());
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
      }, { tag: NOTE_ID_NORMALIZE_TAG });
    }

    return mergeRegister(
      editor.registerNodeTransform(ListItemNode, (node) => {
        // A tagged bulk load backfills ids through $normalizeNoteIdsOnLoad instead, so the
        // transform stays out of the way: assigning here would pre-empt normalization and
        // hide the missing-id diagnostic it reports.
        if (!readyRef.current || $hasUpdateTag(TEST_BRIDGE_LOAD_TAG)) {
          return;
        }
        $ensureNoteId(node);
      }),
    );
  }, [editor, hydrated, docEpoch, docId]);

  return null;
}
