import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW, mergeRegister } from 'lexical';
import { useEffect } from 'react';

import { ANALYTICS_CONSENT_GRANTED_EVENT, trackAnalyticsEvent } from '#platform/analytics';

// Undo history leaves out collaborators' changes and the root a new document
// normalizes, which a collaboration-status flag would count as edits.
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
    window.addEventListener(ANALYTICS_CONSENT_GRANTED_EVENT, report);
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
      () => window.removeEventListener(ANALYTICS_CONSENT_GRANTED_EVENT, report),
    );
  }, [editor]);

  return null;
}
