import { $getNoteByText, collectSerializedNodes, getSerializedRootNodes, meta, placeCaretAtNote, pressKey } from '#tests';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { $getState, $setState } from 'lexical';
import { expect, it } from 'vitest';

import type { RemdoTestApi } from '#client/editor/dev';
import { REORDER_NOTES_DOWN_COMMAND } from '#client/editor/foundation/commands';
import type { SerializedNoteListItemNode } from '#client/editor/runtime/serialized-note-types';
import { checkboxState, markerState, verbatimState } from './note-marker';

const NOTES = ['note1', 'note2', 'note3'];

const isListItem = (node: SerializedLexicalNode): node is SerializedNoteListItemNode => node.type === 'listitem';

const savedItems = (state: SerializedEditorState) =>
  collectSerializedNodes(getSerializedRootNodes(state), isListItem).map(({ marker, checkbox, verbatim }) => [
    marker,
    checkbox,
    verbatim,
  ]);

const readStates = (remdo: RemdoTestApi) =>
  remdo.validate(() =>
    NOTES.map((text) => {
      const note = $getNoteByText(text);
      return [text, $getState(note, markerState), $getState(note, checkboxState)];
    })
  );

it('saves markers, checkboxes and verbatim flags with each note', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    const note1 = $getNoteByText('note1');
    $setState(note1, markerState, 'heading:2');
    $setState(note1, checkboxState, true);
    $setState($getNoteByText('note2'), verbatimState, true);
    $setState($getNoteByText('note3'), markerState, 'block');
  });

  expect(savedItems(remdo.getEditorState())).toEqual([
    ['heading:2', true, undefined],
    [undefined, undefined, true],
    ['block', undefined, undefined],
  ]);
});

it('loads only the stored values it holds', meta({ fixture: 'flat' }), async ({ remdo }) => {
  const valid = ['bullet', 'block', 'number', 'number:0', 'number:999999999', 'heading:1', 'heading:6'];
  const invalid = ['number:07', 'number:-1', 'number:1000000000', 'heading:7', 'check', 3];
  const loaded = (stored: Record<string, unknown>) => {
    const state = remdo.getEditorState();
    const [item] = collectSerializedNodes(getSerializedRootNodes(state), isListItem);
    Object.assign(item!, stored);
    return savedItems(remdo.editor.parseEditorState(JSON.stringify(state)).toJSON())[0];
  };

  for (const marker of valid) {
    expect(loaded({ marker, checkbox: true, verbatim: true })).toEqual([marker, true, true]);
  }
  for (const marker of invalid) {
    expect(loaded({ marker, checkbox: false, verbatim: 'yes' })).toEqual([undefined, undefined, undefined]);
  }
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
