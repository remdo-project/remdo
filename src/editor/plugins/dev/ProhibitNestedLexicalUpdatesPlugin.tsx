import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import { useEffect } from 'react';

const GUARD_KEY = '__remdoProhibitNestedLexicalUpdatesInstalled';

function isAllowedThirdPartyNestedUpdate(stack: string | undefined): boolean {
  if (!stack) return false;
  return stack.includes('@lexical/yjs') || stack.includes('LexicalYjs') || stack.includes('LexicalCollaborationPlugin');
}

export function ProhibitNestedLexicalUpdatesPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const internalEditor = editor as LexicalEditor & { _updating?: boolean } & Record<string, unknown>;
    if (internalEditor[GUARD_KEY]) return;
    internalEditor[GUARD_KEY] = true;

    const previousUpdate = editor.update;

    editor.update = ((updateFn: () => void, options?: EditorUpdateOptions) => {
      if (internalEditor._updating) {
        const stack = new Error('[RemDo] Nested update stack probe').stack;
        if (!isAllowedThirdPartyNestedUpdate(stack)) {
          throw new Error('[RemDo] Nested Lexical editor.update() is prohibited in dev/test.');
        }
      }

      return previousUpdate.call(editor, updateFn, options);
    }) as LexicalEditor['update'];

    return () => {
      internalEditor[GUARD_KEY] = false;
      editor.update = previousUpdate;
    };
  }, [editor]);

  return null;
}

export default ProhibitNestedLexicalUpdatesPlugin;
