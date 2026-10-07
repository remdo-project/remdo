import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';
import { useEffect } from 'react';

import { trackAnalyticsEvent } from '#platform/analytics';

// Undo history leaves out collaborators' changes and the root a new document
// normalizes, which a collaboration-status flag would count as edits.
export function DocumentEditAnalyticsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let reported = false;
    return editor.registerCommand(
      // eslint-disable-next-line ts/no-deprecated -- collaboration still dispatches it; see the TODO(deps) in lexical-open-document.ts.
      CAN_UNDO_COMMAND,
      (canUndo) => {
        if (canUndo && !reported) {
          reported = true;
          trackAnalyticsEvent('document-edited');
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}
