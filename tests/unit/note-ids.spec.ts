import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setState,
  CUT_COMMAND,
  PASTE_COMMAND,
} from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import type { RemdoTestApi } from '@/editor/plugins/dev';
import { placeCaretAtNoteId, pressKey, readOutline } from '#tests';
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
    files: [] as File[],
    get types() {
      return Array.from(data.keys());
    },
  } as unknown as DataTransfer;

  transfer.setData('application/x-lexical-editor', JSON.stringify(payload));
  return transfer;
}

function createClipboardEvent(payload: unknown, type: 'paste' | 'cut' | 'copy' = 'paste'): ClipboardEvent {
  return new ClipboardEvent(type, {
    clipboardData: createDataTransfer(payload),
  });
}

async function selectStructuralNote(remdo: RemdoTestApi, noteId: string): Promise<void> {
  await placeCaretAtNoteId(remdo, noteId, 0);
  await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
  await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
  expect(remdo).toMatchSelection({ state: 'structural', notes: [noteId] });
}

// In tests, CUT_COMMAND only affects the clipboard payload; it doesn't remove the note.
// This helper simulates a real "cut" by issuing CUT_COMMAND and then deleting the selection.
async function cutAndDeleteStructuralNote(remdo: RemdoTestApi, noteId: string) {
  await selectStructuralNote(remdo, noteId);
  expect(remdo).toMatchSelection({ state: 'structural', notes: [noteId] });
  const clipboardPayload = buildClipboardPayload(remdo, [noteId]);
  await remdo.dispatchCommand(CUT_COMMAND, createClipboardEvent(clipboardPayload, 'cut'));
  await selectStructuralNote(remdo, noteId);
  expect(remdo).toMatchSelection({ state: 'structural', notes: [noteId] });
  await pressKey(remdo, { key: 'Delete' });
  return clipboardPayload;
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

  it('treats paste-in-place for a structural selection as a no-op', async ({ remdo }) => {
    await remdo.load('flat');

    await selectStructuralNote(remdo, 'note2');

    const outlineBeforePaste = readOutline(remdo);

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
    expect(readOutline(remdo)).toEqual(outlineBeforePaste);

    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
    expect(readOutline(remdo)).toEqual(outlineBeforePaste);
  });

  it('keeps the original noteId when a copy is pasted in place and elsewhere later', async ({ remdo }) => {
    await remdo.load('flat');

    await selectStructuralNote(remdo, 'note2');

    const outlineBeforePaste = readOutline(remdo);

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2'] });
    expect(readOutline(remdo)).toEqual(outlineBeforePaste);

    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'note2' },
    ]);

    const outlineAfterPaste = readOutline(remdo);
    const pastedNoteId = outlineAfterPaste[3]?.noteId;
    expect(pastedNoteId).toEqual(expect.any(String));
    expect(pastedNoteId).not.toBe('note2');
    const noteIds = outlineAfterPaste.map((note) => note.noteId);
    expect(new Set(noteIds).size).toBe(outlineAfterPaste.length);
  });

  it('preserves noteIds when cutting and pasting a note back in place', async ({ remdo }) => {
    await remdo.load('flat');

    const clipboardPayload = await cutAndDeleteStructuralNote(remdo, 'note2');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await placeCaretAtNoteId(remdo, 'note1', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('preserves noteIds when cutting and pasting a note elsewhere', async ({ remdo }) => {
    await remdo.load('flat');

    const clipboardPayload = await cutAndDeleteStructuralNote(remdo, 'note2');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await placeCaretAtNoteId(remdo, 'note3', Number.POSITIVE_INFINITY);
    await remdo.dispatchCommand(PASTE_COMMAND, createClipboardEvent(clipboardPayload));

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });
});
