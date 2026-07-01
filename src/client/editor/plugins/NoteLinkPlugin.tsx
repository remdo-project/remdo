import { $createTextNode } from 'lexical';

import { $createNoteLinkNode } from '#client/editor/runtime/note-link-node';
import { useCollaborationStatus } from '#client/editor/plugins/collaboration/CollaborationProvider';
import { useTriggerSession } from '#client/editor/triggers/useTriggerSession';
import type { TriggerSpec } from '#client/editor/triggers/types';
import type { LinkPickerOption } from '#client/editor/links/note-link-index';
import { LINK_PICKER_RESULT_LIMIT, $resolveLinkPickerOptions } from './note-link/options';
import { NoteLinkPicker } from './note-link/NoteLinkPicker';
import { getActiveOptionId } from './note-link/option-id';

// Note links are inserted through `@`, an inline trigger character. The shared
// trigger engine owns the open/dismiss/confirm lifecycle (see
// docs/outliner/popups.md); this supplies only the note-link specifics:
// document-scoped option search, the listbox popup, and the committed link node.
export function NoteLinkPlugin() {
  const { docId } = useCollaborationStatus();

  const spec: TriggerSpec<LinkPickerOption> = {
    triggerChar: '@',
    getActiveDescendantId: getActiveOptionId,
    $resolveOptions: (query, anchorNode) =>
      $resolveLinkPickerOptions(query, anchorNode, LINK_PICKER_RESULT_LIMIT),
    $commit: (option, { range }) => {
      const linkNode = $createNoteLinkNode({ docId, noteId: option.noteId }, {});
      linkNode.append($createTextNode(option.title));
      range.insertNodes([linkNode, $createTextNode(' ')]);
    },
    renderPopup: (picker, handlers) => <NoteLinkPicker picker={picker} handlers={handlers} />,
  };

  return useTriggerSession(spec);
}
