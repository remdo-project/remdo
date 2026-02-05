import type { ListNode } from '@lexical/list';
import { $getRoot } from 'lexical';
import { expect, it } from 'vitest';

import { $getNoteChecked, $setNoteChecked } from '#lib/editor/checklist-state';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { getNoteElement, meta } from '#tests';

it('stores checked state on bullet list items', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    const item = $findNoteById('note1')!;
    $setNoteChecked(item, true);
  });

  const checked = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return $getNoteChecked(item);
  });

  expect(checked).toBe(true);

  const element = getNoteElement(remdo, 'note1');
  expect(element.dataset.noteChecked).toBe('true');
});

it('restores checked state when list type toggles', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    const item = $findNoteById('note1')!;
    $setNoteChecked(item, true);
  });

  await remdo.mutate(() => {
    const list = $getRoot().getFirstChild() as ListNode;
    list.setListType('check');
  });

  const checkedInChecklist = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return item.getChecked();
  });
  expect(checkedInChecklist).toBe(true);

  await remdo.mutate(() => {
    const list = $getRoot().getFirstChild() as ListNode;
    list.setListType('bullet');
  });

  const storedInBullet = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return $getNoteChecked(item);
  });
  expect(storedInBullet).toBe(true);

  await remdo.mutate(() => {
    const list = $getRoot().getFirstChild() as ListNode;
    list.setListType('check');
  });

  const checkedAgain = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return item.getChecked();
  });
  expect(checkedAgain).toBe(true);
});
