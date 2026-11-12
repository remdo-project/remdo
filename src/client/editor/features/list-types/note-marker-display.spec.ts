import { $getNoteByText, getNoteElement, meta, setRawNoteCheckedState } from '#tests';
import type { ListNode } from '@lexical/list';
import { $getRoot, $setState } from 'lexical';
import { expect, it } from 'vitest';

import type { RemdoTestApi } from '#client/editor/dev';
import { checkboxState, markerState } from './note-marker';

const NOTES = ['note1', 'note2', 'note3'];

const shown = (remdo: RemdoTestApi) =>
  NOTES.map((text) => {
    const { marker, number, headingLevel, checkbox } = getNoteElement(remdo, text).dataset;
    return { marker, number, headingLevel, checkbox };
  });

const setListType = (remdo: RemdoTestApi, type: 'bullet' | 'number' | 'check') =>
  remdo.mutate(() => {
    ($getRoot().getFirstChild() as ListNode).setListType(type);
  });

it('shows an editor document list type on each of its notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
  const bullet = { marker: 'bullet', number: undefined, headingLevel: undefined, checkbox: undefined };
  expect(shown(remdo)).toEqual([bullet, bullet, bullet]);

  await setListType(remdo, 'number');
  expect(shown(remdo).map(({ marker, number }) => [marker, number])).toEqual([
    ['number', '1'],
    ['number', '2'],
    ['number', '3'],
  ]);

  await setListType(remdo, 'check');
  expect(shown(remdo).map(({ marker, checkbox }) => [marker, checkbox])).toEqual([
    ['bullet', 'true'],
    ['bullet', 'true'],
    ['bullet', 'true'],
  ]);
});

it('shows each note its own marker, number and checkbox', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $setState($getNoteByText('note1'), markerState, 'heading:2');
    $setState($getNoteByText('note2'), markerState, 'number:3');
    const note3 = $getNoteByText('note3');
    $setState(note3, markerState, 'number');
    $setState(note3, checkboxState, true);
  });

  expect(shown(remdo)).toEqual([
    { marker: 'heading', number: undefined, headingLevel: '2', checkbox: undefined },
    { marker: 'number', number: '3', headingLevel: undefined, checkbox: undefined },
    { marker: 'number', number: '4', headingLevel: undefined, checkbox: 'true' },
  ]);
  const note3 = getNoteElement(remdo, 'note3');
  expect([note3.getAttribute('role'), note3.getAttribute('aria-checked')]).toEqual(['checkbox', 'false']);
});

it('numbers a note from 1 when the note before it is not numbered', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await remdo.mutate(() => {
    $setState($getNoteByText('note1'), markerState, 'number:5');
    $setState($getNoteByText('note3'), markerState, 'number');
  });

  expect(shown(remdo).map(({ number }) => number)).toEqual(['5', undefined, '1']);
});

it('gives a checked note a ticked box in any list', meta({ fixture: 'flat' }), async ({ remdo }) => {
  await setRawNoteCheckedState(remdo, 'note2', true);

  const note2 = getNoteElement(remdo, 'note2');
  expect([note2.dataset.checkbox, note2.getAttribute('role'), note2.getAttribute('aria-checked')]).toEqual([
    'true',
    'checkbox',
    'true',
  ]);
  expect(getNoteElement(remdo, 'note1').dataset.checkbox).toBeUndefined();
});
