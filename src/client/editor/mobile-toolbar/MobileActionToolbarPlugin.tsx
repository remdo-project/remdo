import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useState } from 'react';
import type { OpenDocument } from '#note-sdk';

import { OPEN_NOTE_MENU_COMMAND } from '#client/editor/foundation/commands';
import { MobileActionToolbar } from './MobileActionToolbar';

/** Lexical host binding for the otherwise adapter-neutral toolbar surface. */
export function MobileActionToolbarPlugin({ openDocument }: { openDocument: OpenDocument }) {
  const [editor] = useLexicalComposerContext();
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);

  useEffect(
    () => editor.registerRootListener((root) => {
      setPortalRoot(root?.closest('.editor-container') ?? null);
    }),
    [editor],
  );

  const focusEditor = useCallback(() => editor.focus(), [editor]);
  const openNoteMenu = useCallback(() => {
    editor.dispatchCommand(OPEN_NOTE_MENU_COMMAND, undefined);
  }, [editor]);

  return (
    <MobileActionToolbar
      openDocument={openDocument}
      portalRoot={portalRoot}
      focusEditor={focusEditor}
      openNoteMenu={openNoteMenu}
    />
  );
}
