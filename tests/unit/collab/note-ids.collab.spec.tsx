import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CUT_COMMAND, PASTE_COMMAND } from 'lexical';
import {
  buildClipboardPayload,
  createClipboardEvent,
  cutStructuralNoteById,
  placeCaretAtNoteId,
  pressKey,
  readOutline,
  selectStructuralNoteByDom,
  selectNoteRangeById,
  typeText,
} from '#tests';
import { renderCollabEditor } from './_support/remdo-peers';

describe('collaboration note ids', () => {
  it('preserves new note ids across clients', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    await placeCaretAtNoteId(remdo, 'note2', Number.POSITIVE_INFINITY);
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

  it('keeps ids unique after inserts from multiple clients', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    await placeCaretAtNoteId(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await placeCaretAtNoteId(secondary, 'note3', Number.POSITIVE_INFINITY);
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

  it('keeps ids unique after concurrent inserts at the same location', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    await Promise.all([
      (async () => {
        await placeCaretAtNoteId(remdo, 'note2', Number.POSITIVE_INFINITY);
        await pressKey(remdo, { key: 'Enter' });
      })(),
      (async () => {
        await placeCaretAtNoteId(secondary, 'note2', Number.POSITIVE_INFINITY);
        await pressKey(secondary, { key: 'Enter' });
      })(),
    ]);

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    const outlineA = readOutline(remdo);
    const baseline = new Set(['note1', 'note2', 'note3']);
    const noteIds = outlineA
      .map((note) => note.noteId)
      .filter((noteId): noteId is string => typeof noteId === 'string');
    const newIds = noteIds.filter((noteId) => !baseline.has(noteId));

    expect(newIds).toHaveLength(2);
    expect(new Set(noteIds).size).toBe(noteIds.length);
    expect(secondary).toMatchOutline(outlineA);
  });

  it('regenerates ids for paste across clients', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);

    await selectStructuralNoteByDom(remdo, 'note2');
    await pressKey(remdo, { key: 'Delete' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);
    await waitFor(() => {
      expect(secondary).toMatchOutline(readOutline(remdo));
    });

    await placeCaretAtNoteId(remdo, 'note1', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    const expected = [
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];

    expect(remdo).toMatchOutline(expected);
    expect(secondary).toMatchOutline(expected);
    const pastedId = readOutline(remdo).find((note) => note.text === 'note2')?.noteId;
    expect(pastedId).toEqual(expect.any(String));
    expect(pastedId).not.toBe('note2');
  });

  it('regenerates ids when pasting over existing content across clients', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);

    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
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

  it('regenerates ids for multi-note structural paste across clients', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('tree-complex');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    const clipboardPayload = buildClipboardPayload(remdo, ['note2', 'note4']);

    await selectNoteRangeById(remdo, 'note2', 'note4');
    await pressKey(remdo, { key: 'Delete' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);
    await waitFor(() => {
      expect(secondary).toMatchOutline(readOutline(remdo));
    });

    await placeCaretAtNoteId(remdo, 'note5', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
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

  it('drops cut markers after remote edits', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    const clipboardPayload = await cutStructuralNoteById(remdo, 'note2');

    await placeCaretAtNoteId(secondary, 'note2', Number.POSITIVE_INFINITY);
    await typeText(secondary, ' remote');
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
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

  it('drops cut markers after remote structural edits', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    const clipboardPayload = await cutStructuralNoteById(remdo, 'note2');

    await placeCaretAtNoteId(secondary, 'note2', 0);
    await pressKey(secondary, { key: 'Tab' });
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    const expectedOutline = readOutline(remdo);

    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

    expect(remdo).toMatchOutline(expectedOutline);
    await waitFor(() => {
      expect(secondary).toMatchOutline(expectedOutline);
    });
  });

  it('merges cut moves with concurrent edits on the moved note', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('flat');
    await remdo.waitForSynced();

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    const clipboardPayload = await cutStructuralNoteById(remdo, 'note2');

    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    await placeCaretAtNoteId(secondary, 'note2', Number.POSITIVE_INFINITY);
    await typeText(secondary, ' remote');

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

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

  it('merges cut moves with concurrent edits on a moved subtree', async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    await remdo.load('tree-complex');
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

    const secondary = await renderCollabEditor({ docId });
    await secondary.waitForSynced();

    await placeCaretAtNoteId(remdo, 'note6', 0);
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note6', 'note7'] });
    });

    const clipboardEvent = createClipboardEvent(undefined, 'cut');
    await remdo.dispatchCommand(CUT_COMMAND, clipboardEvent, { expect: 'update' });
    const rawPayload = clipboardEvent.clipboardData?.getData('application/x-lexical-editor') ?? '';
    if (!rawPayload) {
      throw new Error('Expected cut to populate clipboard payload.');
    }
    const clipboardPayload = JSON.parse(rawPayload) as { namespace?: string; nodes?: unknown[] };

    await placeCaretAtNoteId(remdo, 'note1', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    await placeCaretAtNoteId(secondary, 'note7', Number.POSITIVE_INFINITY);
    await typeText(secondary, ' remote');

    await Promise.all([remdo.waitForSynced(), secondary.waitForSynced()]);

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
