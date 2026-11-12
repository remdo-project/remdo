import { $getNoteByText, meta, placeCaretAtNote, pressKey } from '#tests';
import type { SerializedLexicalNode } from 'lexical';
import { $getState, $setState } from 'lexical';
import { expect, it } from 'vitest';

import type { RemdoTestApi } from '#client/editor/dev';
import { REORDER_NOTES_DOWN_COMMAND } from '#client/editor/foundation/commands';
import { checkboxState, markerState } from './note-marker';

const NOTES = ['note1', 'note2', 'note3'];

const readStates = (remdo: RemdoTestApi) =>
  remdo.validate(() =>
    NOTES.map((text) => {
      const note = $getNoteByText(text);
      return [text, $getState(note, markerState), $getState(note, checkboxState)];
    })
  );

function listItems(node: SerializedLexicalNode): Record<string, unknown>[] {
  const children = (node as { children?: SerializedLexicalNode[] }).children ?? [];
  return [
    ...(node.type === 'listitem' ? [node as unknown as Record<string, unknown>] : []),
    ...children.flatMap(listItems),
  ];
}

it('saves markers and checkboxes with each note and reads back only the values it holds', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $setState($getNoteByText('note1'), markerState, 'heading:2');
    $setState($getNoteByText('note1'), checkboxState, true);
    $setState($getNoteByText('note3'), markerState, 'number:0');
  });

  const saved = listItems(remdo.getEditorState().root).map(({ marker, checkbox }) => [marker, checkbox]);
  expect(saved).toEqual([['heading:2', true], [undefined, undefined], ['number:0', undefined]]);

  for (const value of ['number:07', 'heading:7', 'check', 3]) {
    expect(markerState.parse(value)).toBeUndefined();
  }
  expect(checkboxState.parse('yes')).toBeUndefined();
});

it('keeps each note its own marker and checkbox through indent, outdent and reorder', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $setState($getNoteByText('note1'), markerState, 'heading:1');
    $setState($getNoteByText('note2'), markerState, 'number:3');
    $setState($getNoteByText('note2'), checkboxState, true);
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
