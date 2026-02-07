import type { ListNode } from '@lexical/list';
import { $getRoot } from 'lexical';
import { expect, it } from 'vitest';

import { $getNoteChecked, $setNoteChecked } from '#lib/editor/checklist-state';
import { SET_NOTE_CHECKED_COMMAND } from '@/editor/commands';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { getNoteElement, meta, placeCaretAtNote, selectNoteRange } from '#tests';

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

it('toggles checked state for the caret note on non-checklist lists', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await placeCaretAtNote(remdo, 'note1');
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const checked = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return $getNoteChecked(item);
  });
  expect(checked).toBe(true);

  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const unchecked = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return $getNoteChecked(item);
  });
  expect(unchecked).toBe(false);
});

it('applies one target state to every selected note when toggling', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    const note1 = $findNoteById('note1')!;
    $setNoteChecked(note1, true);
  });

  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const afterMixedToggle = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(afterMixedToggle).toEqual([true, true]);

  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const afterAllCheckedToggle = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(afterAllCheckedToggle).toEqual([false, false]);
});

it('targets only the payload note key when provided', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });

  const note2Key = remdo.editor.getEditorState().read(() => $findNoteById('note2')!.getKey());
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle', noteKey: note2Key });

  const states = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(states).toEqual([undefined, true]);
});

it('sets checked state explicitly for selected notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    const note1 = $findNoteById('note1')!;
    $setNoteChecked(note1, true);
  });

  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'unchecked' });

  const afterUnchecked = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(afterUnchecked).toEqual([false, false]);

  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'checked' });

  const afterChecked = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(afterChecked).toEqual([true, true]);
});
