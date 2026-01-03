import { $createListItemNode, $createListNode } from '@lexical/list';
import { $createParagraphNode, $createTextNode, $getRoot, $setState } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import { readOutline } from '#tests';
import { createNoteIdAvoiding } from '#lib/editor/note-ids';
import { noteIdState } from '#lib/editor/note-id-state';

describe('note ids', () => {
  it('assigns noteIds to programmatic list items when missing', async ({ remdo }) => {
    await remdo.mutate(() => {
      const root = $getRoot();
      root.clear();

      const list = $createListNode('bullet');
      const item = $createListItemNode();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('note'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    const outline = readOutline(remdo);
    const noteId = outline[0]?.noteId;
    expect(noteId).toEqual(expect.any(String));
    expect(noteId).not.toBe('');
  });

  it('preserves assigned noteIds on programmatic list items', async ({ remdo }) => {
    await remdo.mutate(() => {
      const root = $getRoot();
      root.clear();

      const list = $createListNode('bullet');
      const item = $createListItemNode();
      $setState(item, noteIdState, 'manual-id');
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('note'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    const outline = readOutline(remdo);
    const noteId = outline[0]?.noteId;
    expect(noteId).toBe('manual-id');
  });

  it('createNoteIdAvoiding skips reserved ids', () => {
    const used = new Set<string>(['dup']);
    const testOnlyGenerator = vi.fn()
      .mockReturnValueOnce('dup')
      .mockReturnValueOnce('unique');

    const result = createNoteIdAvoiding(used, testOnlyGenerator);

    expect(result).toBe('unique');
    expect(testOnlyGenerator).toHaveBeenCalledTimes(2);
  });
});

describe('note id normalization on load', () => {
  it('backfills missing noteIds while preserving content order', async ({ remdo }) => {
    await remdo.loadWithSchemaBypass('editor-schema/missing-note-id');

    const outline = readOutline(remdo);
    expect(outline).toHaveLength(1);
    expect(outline[0]?.text).toBe('note1');
    expect(outline[0]?.noteId).toEqual(expect.any(String));
  });

  it('resolves duplicate noteIds while preserving the first occurrence', async ({ remdo }) => {
    await remdo.loadWithSchemaBypass('editor-schema/duplicate-note-id');

    const outline = readOutline(remdo);
    expect(outline.map((note) => note.text)).toEqual(['note1', 'note2']);

    const [first, second] = outline;
    expect(first?.noteId).toBe('duplicated');
    expect(second?.noteId).toEqual(expect.any(String));
    expect(second?.noteId).not.toBe('duplicated');
  });

  it('keeps existing unique noteIds unchanged', async ({ remdo }) => {
    await remdo.load('flat');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});
