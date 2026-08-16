import type { ListNode } from '@lexical/list';
import { $getRoot } from 'lexical';
import { expect, it } from 'vitest';

import type { RemdoTestApi } from '#client/editor/plugins/dev';
import { $getNoteChecked } from '#client/editor/runtime/checklist-state';
import { SET_NOTE_CHECKED_COMMAND } from '#client/editor/commands';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getNoteElement, meta, placeCaretAtNote, selectNoteRange, setRawNoteCheckedState } from '#tests';

const checkedStates = (remdo: RemdoTestApi, ...noteIds: string[]) =>
  remdo.editor.getEditorState().read(() => noteIds.map((id) => $getNoteChecked($findNoteById(id)!)));

it('stores checked state on bullet list items', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await setRawNoteCheckedState(remdo, 'note1', true);

  const checked = remdo.editor.getEditorState().read(() => {
    const item = $findNoteById('note1')!;
    return $getNoteChecked(item);
  });

  expect(checked).toBe(true);

  const element = getNoteElement(remdo, 'note1');
  expect(element.dataset.noteChecked).toBe('true');
});

it('restores checked state when list type toggles', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await setRawNoteCheckedState(remdo, 'note1', true);

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
  expect(unchecked).toBe(undefined);
});

it('toggles checked state recursively for the caret note subtree', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  // note2 owns note3, so checking both makes the whole subtree checked.
  await setRawNoteCheckedState(remdo, 'note2', true);
  await setRawNoteCheckedState(remdo, 'note3', true);

  await placeCaretAtNote(remdo, 'note2');
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const afterCheckedToggle = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(afterCheckedToggle).toEqual([undefined, undefined, undefined]);

  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const afterUncheckedToggle = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(afterUncheckedToggle).toEqual([true, true, undefined]);
});

it('completes a partly checked subtree instead of clearing it', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  // note2 is checked while its child note3 is not: the subtree is mixed.
  await setRawNoteCheckedState(remdo, 'note2', true);

  await placeCaretAtNote(remdo, 'note2');
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  expect(checkedStates(remdo, 'note2', 'note3')).toEqual([true, true]);

  // Only once the whole subtree is checked does toggling clear it.
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  expect(checkedStates(remdo, 'note2', 'note3')).toEqual([undefined, undefined]);
});

it('computes range toggle polarity from the targets subtrees', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  // The range resolves to two root targets, note2 (which owns note3) and note4.
  // Checking note2 and note4 alone leaves note2's subtree partly checked, so the
  // range is not fully checked and toggling completes it.
  await setRawNoteCheckedState(remdo, 'note2', true);
  await setRawNoteCheckedState(remdo, 'note4', true);

  await selectNoteRange(remdo, 'note2', 'note4');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  expect(checkedStates(remdo, 'note2', 'note3', 'note4')).toEqual([true, true, true]);
});

it('keeps a checked note complete while marking its subtree as mixed', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  // note2 owns note3. Checking note2 alone completes note2 and leaves note3 open.
  await setRawNoteCheckedState(remdo, 'note2', true);

  const note2 = getNoteElement(remdo, 'note2');
  expect(note2.dataset.noteChecked).toBe('true');
  expect(note2.dataset.noteSubtree).toBe('mixed');

  // note1 owns note2, so its subtree is mixed too, but note1 is not itself done.
  const note1 = getNoteElement(remdo, 'note1');
  expect(note1.dataset.noteChecked).toBeUndefined();
  expect(note1.dataset.noteSubtree).toBe('mixed');

  // Completing the subtree clears the mixed marking.
  await setRawNoteCheckedState(remdo, 'note3', true);
  expect(getNoteElement(remdo, 'note2').dataset.noteSubtree).toBeUndefined();
});

it('marks the subtree of a checked note as open work', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  // The flag sits on the children-wrapper, the sibling right after the note.
  const wrapperOf = (noteId: string) => {
    const next = getNoteElement(remdo, noteId).nextElementSibling;
    return next instanceof HTMLElement && next.classList.contains('list-nested-item') ? next : null;
  };

  await setRawNoteCheckedState(remdo, 'note2', true);
  expect(wrapperOf('note2')?.dataset.noteUnderChecked).toBe('true');

  // note4 is not checked, so nothing under it is marked as open work.
  expect(wrapperOf('note4')?.dataset.noteUnderChecked).toBeUndefined();

  // Unchecking the ancestor clears the marking for its whole subtree.
  await setRawNoteCheckedState(remdo, 'note2', false);
  expect(wrapperOf('note2')?.dataset.noteUnderChecked).toBeUndefined();
});

it('applies one target state to every note in the range when toggling', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  await setRawNoteCheckedState(remdo, 'note2', true);
  await setRawNoteCheckedState(remdo, 'note3', false);
  await setRawNoteCheckedState(remdo, 'note4', false);

  await selectNoteRange(remdo, 'note2', 'note4');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const afterMixedToggle = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(afterMixedToggle).toEqual([true, true, true]);

  await selectNoteRange(remdo, 'note2', 'note4');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle' });

  const afterAllCheckedToggle = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(afterAllCheckedToggle).toEqual([undefined, undefined, undefined]);
});

it('targets only the payload note key when provided', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });

  const note2Key = remdo.editor.getEditorState().read(() => $findNoteById('note2')!.getKey());
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle', noteItemKey: note2Key });

  const states = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(states).toEqual([undefined, true]);
});

it('applies payload note key toggles recursively to that note subtree only', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  await selectNoteRange(remdo, 'note2', 'note4');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });

  const note2Key = remdo.editor.getEditorState().read(() => $findNoteById('note2')!.getKey());
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'toggle', noteItemKey: note2Key });

  const states = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(states).toEqual([true, true, undefined]);
});

it('sets checked state explicitly for selected notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await setRawNoteCheckedState(remdo, 'note1', true);

  await selectNoteRange(remdo, 'note1', 'note2');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'unchecked' });

  const afterUnchecked = remdo.editor.getEditorState().read(() => {
    const note1 = $findNoteById('note1')!;
    const note2 = $findNoteById('note2')!;
    return [$getNoteChecked(note1), $getNoteChecked(note2)];
  });
  expect(afterUnchecked).toEqual([undefined, undefined]);

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

it('sets checked state recursively for every note in the range', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
  await setRawNoteCheckedState(remdo, 'note2', true);
  await setRawNoteCheckedState(remdo, 'note3', false);
  await setRawNoteCheckedState(remdo, 'note4', true);

  await selectNoteRange(remdo, 'note2', 'note4');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'unchecked' });

  const afterUnchecked = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(afterUnchecked).toEqual([undefined, undefined, undefined]);

  await selectNoteRange(remdo, 'note2', 'note4');
  expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
  await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, { state: 'checked' });

  const afterChecked = remdo.editor.getEditorState().read(() => {
    const note2 = $findNoteById('note2')!;
    const note3 = $findNoteById('note3')!;
    const note4 = $findNoteById('note4')!;
    return [$getNoteChecked(note2), $getNoteChecked(note3), $getNoteChecked(note4)];
  });
  expect(afterChecked).toEqual([true, true, true]);
});
