import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLayoutEffect } from 'react';

import { $syncInternalNoteLinkNodeUrls } from '#lib/editor/internal-note-link-node';
import { useCollaborationStatus } from './collaboration';

export function InternalLinkDocContextPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();

  useLayoutEffect(() => {
    editor.update(() => {
      $syncInternalNoteLinkNodeUrls(docId);
    });
  }, [docId, editor]);

  return null;
}
