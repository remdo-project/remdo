import { describe, expect, it } from 'vitest';
import { placeCaretAtNoteId, pressKey, readOutline } from '#tests';
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
});
