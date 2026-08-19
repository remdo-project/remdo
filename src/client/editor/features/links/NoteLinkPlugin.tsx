import { $createTextNode } from 'lexical';

import { $createNoteLinkNode } from '#client/editor/features/links/note-link-node';
import { useCollaborationStatus } from '#client/editor/runtime/collaboration/CollaborationProvider';
import { useTriggerSession } from '#client/editor/triggers/useTriggerSession';
import type { TriggerSpec } from '#client/editor/triggers/types';
import type { LinkPickerOption } from '#client/editor/features/links/note-link-index';
import { LINK_PICKER_RESULT_LIMIT, $resolveLinkPickerOptions } from './picker/options';
import { NoteLinkPicker } from './picker/NoteLinkPicker';
import { getActiveOptionId } from './picker/option-id';

// Note links are inserted through `@`, an inline trigger character. The shared
// trigger engine owns the open/dismiss/confirm lifecycle (see
// docs/specs/outliner/popups.md); this supplies only the note-link specifics:
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
