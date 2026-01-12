import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  appendTextToNote,
  copySelection,
  cutSelection,
  pastePayload,
  placeCaretAtNote,
  pressKey,
  readOutline,
  selectStructuralNotes,
  meta,
} from '#tests';
import { createCollabPeer } from './_support/remdo-peers';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collaboration note ids', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('preserves new note ids across clients', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await waitFor(() => {
      const outlineA = readOutline(remdo);
      expect(secondary).toMatchOutline(outlineA);
    });

    const outlineA = readOutline(remdo);
    const baseline = new Set(['note1', 'note2', 'note3']);
    const newIds = outlineA
      .map((note) => note.noteId)
      .filter((noteId): noteId is string => typeof noteId === 'string' && !baseline.has(noteId));

    expect(newIds).toHaveLength(1);
    expect(secondary).toMatchOutline(outlineA);
    expect(secondary).toMatchOutline(outlineA);
  });

  it('keeps ids unique after inserts from multiple clients', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await placeCaretAtNote(secondary, 'note3', Number.POSITIVE_INFINITY);
    await pressKey(secondary, { key: 'Enter' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await waitFor(() => {
      expect(secondary).toMatchOutline(readOutline(remdo));
    });

    const outlineA = readOutline(remdo);
    const noteIds = outlineA
      .map((note) => note.noteId)
      .filter((noteId): noteId is string => typeof noteId === 'string');
    const uniqueIds = new Set(noteIds);

    expect(uniqueIds.size).toBe(noteIds.length);
    expect(secondary).toMatchOutline(outlineA);
  });

  it('keeps ids unique after concurrent inserts at the same location', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await Promise.all([
      (async () => {
        await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
        await pressKey(remdo, { key: 'Enter' });
      })(),
      (async () => {
        await placeCaretAtNote(secondary, 'note2', Number.POSITIVE_INFINITY);
        await pressKey(secondary, { key: 'Enter' });
      })(),
    ]);

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    let outlineA = readOutline(remdo);
    await waitFor(() => {
      outlineA = readOutline(remdo);
      const baseline = new Set(['note1', 'note2', 'note3']);
      const noteIds = outlineA
        .map((note) => note.noteId)
        .filter((noteId): noteId is string => typeof noteId === 'string');
      const newIds = noteIds.filter((noteId) => !baseline.has(noteId));

      expect(newIds).toHaveLength(2);
      expect(new Set(noteIds).size).toBe(noteIds.length);
    });
    expect(secondary).toMatchOutline(outlineA);
  });

  it('regenerates ids for paste across clients', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);
    await pressKey(remdo, { key: 'Delete' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);
    await waitFor(() => {
      expect(secondary).toMatchOutline(readOutline(remdo));
    });

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    const expected = [
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];

    await waitFor(() => {
      expect(remdo).toMatchOutline(expected);
      expect(secondary).toMatchOutline(expected);
    });

    const pastedId = readOutline(remdo).find((note) => note.text === 'note2')?.noteId;
    expect(pastedId).toEqual(expect.any(String));
    expect(pastedId).not.toBe('note2');
  });

  it('regenerates ids when pasting over existing content across clients', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await waitFor(() => {
      const outlineA = readOutline(remdo);
      const noteIds = outlineA
        .map((note) => note.noteId)
        .filter((noteId): noteId is string => typeof noteId === 'string');

      expect(outlineA).toHaveLength(4);
      expect(outlineA[1]?.noteId).toBe('note2');
      expect(noteIds.filter((noteId) => noteId === 'note2')).toHaveLength(1);
      expect(new Set(noteIds).size).toBe(noteIds.length);
      expect(secondary).toMatchOutline(outlineA);
    });
  });

  it('regenerates ids for multi-note structural paste across clients', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2', 'note4');
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3', 'note4'] });
    });
    const clipboardPayload = await copySelection(remdo);
    await pressKey(remdo, { key: 'Delete' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);
    await waitFor(() => {
      expect(secondary).toMatchOutline(readOutline(remdo));
    });

    await placeCaretAtNote(remdo, 'note5', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await waitFor(() => {
      const outlineA = readOutline(remdo);
      const noteIds = outlineA
        .map((note) => note.noteId)
        .filter((noteId): noteId is string => typeof noteId === 'string');

      expect(noteIds.filter((noteId) => noteId === 'note2')).toHaveLength(0);
      expect(noteIds.filter((noteId) => noteId === 'note4')).toHaveLength(0);
      expect(new Set(noteIds).size).toBe(noteIds.length);
      expect(secondary).toMatchOutline(outlineA);
    });
  });

  it('drops cut markers after remote edits', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(secondary, 'note2', Number.POSITIVE_INFINITY);
    await appendTextToNote(secondary, 'note2', ' remote');
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);
    await waitFor(() => {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'note2 remote' },
        { noteId: 'note3', text: 'note3' },
      ]);
    });

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    // Paste is a no-op because the cut marker was invalidated by the remote edit.
    const expectedOutline = [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2 remote' },
      { noteId: 'note3', text: 'note3' },
    ];
    expect(remdo).toMatchOutline(expectedOutline);
    await waitFor(() => {
      expect(secondary).toMatchOutline(expectedOutline);
    });
  });

  it('drops cut markers after remote deletions', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);

    await selectStructuralNotes(secondary, 'note2');
    await pressKey(secondary, { key: 'Delete' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    const expectedOutline = [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ];

    await waitFor(() => {
      expect(remdo).toMatchOutline(expectedOutline);
    });

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    expect(remdo).toMatchOutline(expectedOutline);
    await waitFor(() => {
      expect(secondary).toMatchOutline(expectedOutline);
    });
  });

  it('drops cut markers after remote structural edits', meta({ fixture: 'flat' }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(secondary, 'note2', 0);
    await pressKey(secondary, { key: 'Tab' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    const expectedOutline = [
      { noteId: 'note1', text: 'note1', children: [{ noteId: 'note2', text: 'note2' }] },
      { noteId: 'note3', text: 'note3' },
    ];
    await waitFor(() => {
      expect(remdo).toMatchOutline(expectedOutline);
    });

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    expect(remdo).toMatchOutline(expectedOutline);
    await waitFor(() => {
      expect(secondary).toMatchOutline(expectedOutline);
    });
  });

  it('merges cut moves with concurrent edits on the moved note', meta({ fixture: 'flat' }, { retry: 3 }), async ({ remdo }) => {
        await remdo.waitForSynced();

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    await placeCaretAtNote(secondary, 'note2', Number.POSITIVE_INFINITY);
    await appendTextToNote(secondary, 'note2', ' remote');

    const expectedOutline = [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2 remote' },
    ];

    await waitFor(() => {
      expect(remdo).toMatchOutline(expectedOutline);
      expect(secondary).toMatchOutline(expectedOutline);
    });
  });

  it('merges cut moves with concurrent edits on a moved subtree', meta({ fixture: 'tree-complex' }, { retry: 3 }), async ({ remdo }) => {
        await remdo.waitForSynced();

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);

    const secondary = await createCollabPeer(remdo);

    await selectStructuralNotes(remdo, 'note6', 'note7');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note6', 'note7'] });

    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    await placeCaretAtNote(secondary, 'note7', Number.POSITIVE_INFINITY);
    await appendTextToNote(secondary, 'note7', ' remote');

    const expectedOutline = [
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7 remote' }] },
      { noteId: 'note5', text: 'note5' },
    ];

    await waitFor(() => {
      expect(remdo).toMatchOutline(expectedOutline);
      expect(secondary).toMatchOutline(expectedOutline);
    });
  });
});
