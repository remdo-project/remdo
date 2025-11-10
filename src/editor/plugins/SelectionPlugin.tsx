import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

/**
 * Placeholder plugin that will eventually enforce the selection guarantees
 * described in docs/selection.md. For now it just subscribes to editor updates
 * so we have a single integration point for upcoming work.
 */
export function SelectionPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      // Selection orchestration coming soon.
    });
  }, [editor]);

  return null;
}
