import type { LexicalEditor } from 'lexical';
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

interface LexicalTestBridgeProps {
  onReady: (editor: LexicalEditor) => void;
}

export function LexicalTestBridge({ onReady }: LexicalTestBridgeProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);

  return null;
}
