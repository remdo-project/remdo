import { $getNoteByText, collectSerializedNodes, getSerializedRootNodes, meta, placeCaretAtNote, pressKey } from '#tests';
import { $getState, $setState } from 'lexical';
import { expect, it } from 'vitest';

import type { RemdoTestApi } from '#client/editor/dev';
import { REORDER_NOTES_DOWN_COMMAND } from '#client/editor/foundation/commands';
import type { SerializedNoteListItemNode } from '#client/editor/runtime/serialized-note-types';
import { checkboxState, markerState } from './note-marker';

const NOTES = ['note1', 'note2', 'note3'];

const readStates = (remdo: RemdoTestApi) =>
  remdo.validate(() =>
    NOTES.map((text) => {
      const note = $getNoteByText(text);
      return [text, $getState(note, markerState), $getState(note, checkboxState)];
    })
  );

it('saves markers and checkboxes with each note and reads back only the values it holds', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    const note1 = $getNoteByText('note1');
    $setState(note1, markerState, 'heading:2');
    $setState(note1, checkboxState, true);
    $setState($getNoteByText('note3'), markerState, 'number:0');
  });

  const saved = collectSerializedNodes(
    getSerializedRootNodes(remdo.getEditorState()),
    (node): node is SerializedNoteListItemNode => node.type === 'listitem'
  ).map(({ marker, checkbox }) => [marker, checkbox]);
  expect(saved).toEqual([['heading:2', true], [undefined, undefined], ['number:0', undefined]]);

  for (const value of ['bullet', 'number', 'number:0', 'number:999999999', 'heading:1', 'heading:6']) {
    expect(markerState.parse(value)).toBe(value);
  }
  expect(checkboxState.parse(true)).toBe(true);
  for (const value of ['number:07', 'number:1000000000', 'heading:7', 'check', 3]) {
    expect(markerState.parse(value)).toBeUndefined();
  }
  expect(checkboxState.parse('yes')).toBeUndefined();
});

it('keeps each note its own marker and checkbox through indent, outdent and reorder', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $setState($getNoteByText('note1'), markerState, 'heading:1');
    const note2 = $getNoteByText('note2');
    $setState(note2, markerState, 'number:3');
    $setState(note2, checkboxState, true);
    $setState($getNoteByText('note3'), markerState, 'bullet');
  });
  const expected = [
    ['note1', 'heading:1', undefined],
    ['note2', 'number:3', true],
    ['note3', 'bullet', undefined],
  ];

  await placeCaretAtNote(remdo, 'note2');
  await pressKey(remdo, { key: 'Tab' });
  expect(readStates(remdo)).toEqual(expected);

  await pressKey(remdo, { key: 'Tab', shift: true });
  expect(readStates(remdo)).toEqual(expected);

  await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
  expect(remdo).toMatchOutline(`
    - note1
    - note3
    - note2
  `);
  expect(readStates(remdo)).toEqual(expected);
});
