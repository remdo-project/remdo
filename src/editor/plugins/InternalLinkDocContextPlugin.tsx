import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLayoutEffect } from 'react';

import { clearInternalLinkDocContext, setInternalLinkDocContext } from '#lib/editor/internal-link-doc-context';
import { useCollaborationStatus } from './collaboration';

export function InternalLinkDocContextPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();

  useLayoutEffect(() => {
    setInternalLinkDocContext(editor, docId);
    return () => {
      clearInternalLinkDocContext(editor);
    };
  }, [docId, editor]);

  return null;
}
