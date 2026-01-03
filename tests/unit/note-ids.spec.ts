import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setState,
  PASTE_COMMAND,
} from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import { placeCaretAtNoteId, readOutline } from '#tests';
import { createNoteIdAvoiding } from '#lib/editor/note-ids';
import { noteIdState } from '#lib/editor/note-id-state';

function createDataTransfer(payload: unknown): DataTransfer {
  const data = new Map<string, string>();
  const transfer = {
    getData(type: string) {
      return data.get(type) ?? '';
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
    get types() {
      return Array.from(data.keys());
    },
  } as unknown as DataTransfer;

  transfer.setData('application/x-lexical-editor', JSON.stringify(payload));
  return transfer;
}

interface ClipboardEventPayload {
  clipboardData: DataTransfer;
  preventDefault: () => void;
}

function createClipboardEvent(payload: unknown): ClipboardEventPayload {
  return {
    clipboardData: createDataTransfer(payload),
    preventDefault: () => {},
  };
}

function buildClipboardPayload(remdo: RemdoTestApi, noteIds: string[]) {
  const state = remdo.getEditorState();
  const root = (state as { root?: { children?: Array<{ type?: string; children?: unknown[] }> } }).root;
  if (!root || !Array.isArray(root.children)) {
    throw new Error('Expected editor state root with children for clipboard payload.');
  }

  const listNode = root.children.find((child) => child.type === 'list');
  if (!listNode || !Array.isArray(listNode.children)) {
    throw new Error('Expected a list node with children for clipboard payload.');
  }

  const selectedItems = listNode.children.filter((child) => {
    const noteId = (child as { noteId?: unknown }).noteId;
    return typeof noteId === 'string' && noteIds.includes(noteId);
  });

  if (selectedItems.length !== noteIds.length) {
    throw new Error(`Expected to find ${noteIds.length} list items for clipboard payload.`);
  }

  return {
    namespace: (remdo.editor as { _config?: { namespace?: string } })._config?.namespace ?? 'remdo',
    nodes: [{ ...listNode, children: selectedItems }],
  };
}

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

describe('note ids on paste', () => {
  it('assigns a fresh noteId when pasting a copied note', async ({ remdo }) => {
    await remdo.load('flat');

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);
    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);

    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'note2' },
    ]);

    const outline = readOutline(remdo);
    const noteIds = outline.map((note) => note.noteId);
    expect(new Set(noteIds).size).toBe(outline.length);
  });

  it('assigns fresh noteIds when pasting multiple copied notes', async ({ remdo }) => {
    await remdo.load('flat');

    const clipboardPayload = buildClipboardPayload(remdo, ['note1', 'note2']);
    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);

    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'note1' },
      { noteId: null, text: 'note2' },
    ]);

    const outline = readOutline(remdo);
    const noteIds = outline.map((note) => note.noteId);
    expect(new Set(noteIds).size).toBe(outline.length);
  });
});
