import { registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

export function CheckListPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => registerCheckList(editor), [editor]);

  return null;
}
