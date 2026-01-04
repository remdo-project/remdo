import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PASTE_COMMAND } from 'lexical';
import {
  buildClipboardPayload,
  createClipboardEvent,
  placeCaretAtNoteId,
  pressKey,
  readOutline,
  selectStructuralNoteByDom,
  selectNoteRangeById,
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

  it('preserves ids for non-conflicting paste across clients', async ({ remdo }) => {
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
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ];

    expect(remdo).toMatchOutline(expected);
    expect(secondary).toMatchOutline(expected);
  });

  it('regenerates conflicting pasted ids across clients', async ({ remdo }) => {
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

  it('preserves subtree ids for multi-note structural paste across clients', async ({ remdo }) => {
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

      expect(noteIds.filter((noteId) => noteId === 'note2')).toHaveLength(1);
      expect(noteIds.filter((noteId) => noteId === 'note4')).toHaveLength(1);
      expect(secondary).toMatchOutline(outlineA);
    });
  });
});
