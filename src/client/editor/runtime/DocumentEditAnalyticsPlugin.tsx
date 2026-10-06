import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW, mergeRegister } from 'lexical';
import { useEffect } from 'react';

import { trackAnalyticsEvent } from '#platform/analytics';

// Undo history holds the user's own edits, which separates them from the schema
// normalization, imports, and collaborator changes that also modify the document.
export function DocumentEditAnalyticsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let canUndo = false;
    let reported = false;
    const report = () => {
      if (canUndo && !reported) {
        reported = trackAnalyticsEvent('document-edited');
      }
    };
    return mergeRegister(
      editor.registerCommand(
        // eslint-disable-next-line ts/no-deprecated -- collaboration still dispatches it; see the TODO(deps) in lexical-open-document.ts.
        CAN_UNDO_COMMAND,
        (nextCanUndo) => {
          canUndo = nextCanUndo;
          report();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(report),
    );
  }, [editor]);

  return null;
}
