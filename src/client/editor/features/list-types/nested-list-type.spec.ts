import { expect, it } from 'vitest';

import { $getNestedListType } from '#client/editor/features/list-types/nested-list-type';
import { SET_NESTED_LIST_TYPE_COMMAND } from '#client/editor/foundation/commands';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getNoteKey, meta } from '#tests';

it('converts only the target list', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  const noteKey = getNoteKey(remdo, 'note1');
  await remdo.dispatchCommand(SET_NESTED_LIST_TYPE_COMMAND, { noteItemKey: noteKey, listType: 'number' });

  const types = remdo.editor.getEditorState().read(() => ({
    note1: $getNestedListType($findNoteById('note1')!),
    note2: $getNestedListType($findNoteById('note2')!),
  }));
  expect(types.note1).toBe('number');
  expect(types.note2).toBe('bullet');
});

it('leaves a leaf unchanged', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  const noteKey = getNoteKey(remdo, 'note5');
  await remdo.dispatchCommand(
    SET_NESTED_LIST_TYPE_COMMAND,
    { noteItemKey: noteKey, listType: 'check' },
    { expect: 'noop' }
  );

  const type = remdo.editor.getEditorState().read(() => $getNestedListType($findNoteById('note5')!));
  expect(type).toBeNull();
});
