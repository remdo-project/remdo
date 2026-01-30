import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setState,
} from 'lexical';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SerializedElementNode, SerializedLexicalNode, SerializedTextNode } from 'lexical';
import type { SerializedNoteListItemNode } from '#lib/editor/serialized-note-types';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import {
  buildClipboardPayload,
  buildCustomClipboardPayload,
  copySelection,
  cutSelection,
  dragDomSelectionBetween,
  getNoteTextNode,
  getSerializedRootListNode,
  pastePayload,
  placeCaretAtNote,
  pressKey,
  readOutline,
  selectStructuralNotesByDomRange,
  selectStructuralNotes,
  selectNoteRange,
  typeText,
  meta,
} from '#tests';
import { createNoteIdAvoiding } from '#lib/editor/note-ids';
import { noteIdState } from '#lib/editor/note-id-state';


function findSerializedListItem(node: SerializedLexicalNode, noteId: string): SerializedNoteListItemNode | null {
  if (node.type === 'listitem') {
    const listItem = node as SerializedNoteListItemNode;
    if (listItem.noteId === noteId) {
      return listItem;
    }
  }

  const children = getSerializedChildren(node);
  for (const child of children) {
    const found = findSerializedListItem(child, noteId);
    if (found) {
      return found;
    }
  }

  return null;
}

function cloneSerializedListItemByNoteId(remdo: RemdoTestApi, noteId: string): SerializedNoteListItemNode {
  const listNode = getSerializedRootListNode(remdo) as SerializedLexicalNode;
  const match = findSerializedListItem(listNode, noteId);
  if (!match) {
    throw new Error(`Expected serialized list item with noteId ${noteId}`);
  }
  return structuredClone(match);
}

function cloneWrapperAfterNoteId(remdo: RemdoTestApi, noteId: string): SerializedNoteListItemNode {
  const listNode = getSerializedRootListNode(remdo);
  const children = listNode.children as SerializedNoteListItemNode[];
  const index = children.findIndex((child) => child.type === 'listitem' && child.noteId === noteId);
  if (index === -1) {
    throw new Error(`Expected wrapper list item after noteId ${noteId}`);
  }
  const wrapper = children[index + 1];
  if (wrapper && wrapper.type === 'listitem') {
    return structuredClone(wrapper);
  }
  throw new Error(`Expected wrapper list item after noteId ${noteId}`);
}

function setSerializedText(node: SerializedLexicalNode, text: string): void {
  if (node.type === 'text') {
    (node as SerializedTextNode).text = text;
    return;
  }

  const children = getSerializedChildren(node);
  for (const child of children) {
    if (child.type === 'text') {
      (child as SerializedTextNode).text = text;
      return;
    }
  }
}

function getSerializedChildren(node: SerializedLexicalNode): SerializedLexicalNode[] {
  return isSerializedElementNode(node) ? node.children : [];
}

function isSerializedElementNode(node: SerializedLexicalNode): node is SerializedElementNode {
  return 'children' in node && Array.isArray((node as SerializedElementNode).children);
}

function collectOutlineNoteIds(outline: ReturnType<typeof readOutline>): string[] {
  const ids: string[] = [];
  const stack = [...outline];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.noteId) {
      ids.push(node.noteId);
    }
    if (node.children) {
      stack.push(...node.children);
    }
  }
  return ids;
}

function findOutlineNodeByText(outline: ReturnType<typeof readOutline>, text: string) {
  const stack = [...outline];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.text === text) {
      return node;
    }
    if (node.children) {
      stack.push(...node.children);
    }
  }
  return null;
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
  it(
    'backfills missing noteIds while preserving content order',
    meta({
      fixture: 'editor-schema/missing-note-id',
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant note-id-normalized missing-note-id path=0 text="note1"'],
    }),
    async ({ remdo }) => {
      const outline = readOutline(remdo);
      expect(outline).toHaveLength(1);
      expect(outline[0]?.text).toBe('note1');
      expect(outline[0]?.noteId).toEqual(expect.any(String));
    }
  );

  it(
    'resolves duplicate noteIds while preserving the first occurrence',
    meta({
      fixture: 'editor-schema/duplicate-note-id',
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant note-id-normalized duplicate-note-id noteId=duplicated path=1 text="note2"'],
    }),
    async ({ remdo }) => {
      const outline = readOutline(remdo);
      expect(outline.map((note) => note.text)).toEqual(['note1', 'note2']);

      const [first, second] = outline;
      expect(first?.noteId).toBe('duplicated');
      expect(second?.noteId).toEqual(expect.any(String));
      expect(second?.noteId).not.toBe('duplicated');
    }
  );

  it('keeps existing unique noteIds unchanged', meta({ fixture: 'flat' }), async ({ remdo }) => {
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});

describe('note ids on paste', () => {
  it('assigns a fresh noteId when pasting a copied note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'note2' },
    ]);

    const outline = readOutline(remdo);
    const noteIds = outline.map((note) => note.noteId);
    const pastedNote = outline.at(-1);
    expect(pastedNote?.text).toBe('note2');
    expect(pastedNote?.noteId).toBeTruthy();
    expect(pastedNote?.noteId).not.toBe('note2');
    expect(new Set(noteIds).size).toBe(outline.length);
  });

  it('assigns fresh noteIds when pasting multiple copied notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note1', 'note2');
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
    });
    const clipboardPayload = await copySelection(remdo);
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);

    await pastePayload(remdo, clipboardPayload);

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

  it('regenerates noteIds when pasting over a structural selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');

    const clipboardPayload = await copySelection(remdo);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const outline = readOutline(remdo);
    expect(outline[1]?.noteId).toBeTruthy();
    expect(outline[1]?.noteId).not.toBe('note2');
  });

  it('regenerates noteIds inside clipboard payloads that contain duplicates', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);
    const listNode = clipboardPayload.nodes[0];
    if (!listNode || !Array.isArray(listNode.children) || listNode.children.length === 0) {
      throw new Error('Expected clipboard list node with children for duplication test.');
    }
    const firstChild = listNode.children[0];
    if (!firstChild) {
      throw new Error('Expected clipboard list node with children for duplication test.');
    }
    const duplicate = structuredClone(firstChild);
    listNode.children.push(duplicate);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const outline = readOutline(remdo);
    const noteIds = outline.map((note) => note.noteId);
    expect(new Set(noteIds).size).toBe(outline.length);
  });

  it('assigns fresh noteIds when clipboard payload omits them (including nested)', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const parent = cloneSerializedListItemByNoteId(remdo, 'note1');
    const wrapper = cloneWrapperAfterNoteId(remdo, 'note1');
    delete parent.noteId;
    setSerializedText(parent, 'pasted parent');

    const nested = findSerializedListItem(wrapper, 'note2');
    if (!nested) {
      throw new Error('Expected nested note2 in wrapper payload.');
    }
    delete nested.noteId;
    setSerializedText(nested, 'pasted child');

    const clipboardPayload = buildCustomClipboardPayload(remdo, [parent, wrapper]);
    await placeCaretAtNote(remdo, 'note6', Number.POSITIVE_INFINITY);

    await pastePayload(remdo, clipboardPayload);

    const outline = readOutline(remdo);
    const pastedParent = findOutlineNodeByText(outline, 'pasted parent');
    const pastedChild = findOutlineNodeByText(outline, 'pasted child');
    expect(pastedParent?.noteId).toEqual(expect.any(String));
    expect(pastedChild?.noteId).toEqual(expect.any(String));
    expect(pastedParent?.noteId).not.toBe('note1');
    expect(pastedChild?.noteId).not.toBe('note2');

    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('regenerates ids when replacing multi-note structural selections', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotesByDomRange(remdo, 'note1', 'note6');
    expect(remdo).toMatchSelection({
      state: 'structural',
      notes: ['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'],
    });

    const note2 = cloneSerializedListItemByNoteId(remdo, 'note2');
    const note7 = cloneSerializedListItemByNoteId(remdo, 'note7');
    const clipboardPayload = buildCustomClipboardPayload(remdo, [note2, note7]);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: null, text: 'note2' },
      { noteId: null, text: 'note7' },
    ]);
  });

  it('regenerates ids for range selections that span notes (snaps to structural)', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note1', 'note2');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });

    const note2 = cloneSerializedListItemByNoteId(remdo, 'note2');
    const clipboardPayload = buildCustomClipboardPayload(remdo, [note2]);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('regenerates duplicate noteIds across parent/child clipboard nodes', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const parent = cloneSerializedListItemByNoteId(remdo, 'note1');
    const wrapper = cloneWrapperAfterNoteId(remdo, 'note1');
    parent.noteId = 'dup';
    setSerializedText(parent, 'dup parent');

    const nested = findSerializedListItem(wrapper, 'note2');
    if (!nested) {
      throw new Error('Expected nested note2 in wrapper payload.');
    }
    nested.noteId = 'dup';
    setSerializedText(nested, 'dup child');

    const clipboardPayload = buildCustomClipboardPayload(remdo, [parent, wrapper]);

    await placeCaretAtNote(remdo, 'note6', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    const outline = readOutline(remdo);
    const dupParent = findOutlineNodeByText(outline, 'dup parent');
    const dupChild = findOutlineNodeByText(outline, 'dup child');
    expect(dupParent?.noteId).toEqual(expect.any(String));
    expect(dupChild?.noteId).toEqual(expect.any(String));
    expect(dupParent?.noteId).not.toBe('dup');
    expect(dupChild?.noteId).not.toBe('dup');

    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('regenerates noteIds that equal the document id', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const docId = remdo.getCollabDocId();
    const docNote = cloneSerializedListItemByNoteId(remdo, 'note2');
    docNote.noteId = docId;
    setSerializedText(docNote, 'doc-id');
    const clipboardPayload = buildCustomClipboardPayload(remdo, [docNote]);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'doc-id' },
    ]);

    const insertedId = findOutlineNodeByText(readOutline(remdo), 'doc-id')?.noteId;
    expect(insertedId).toBeTruthy();
    expect(insertedId).not.toBe(docId);
  });

  it('regenerates noteIds for repeated pastes of the same payload', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);

    await pastePayload(remdo, clipboardPayload);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'note2' },
      { noteId: null, text: 'note2' },
    ]);

    const outline = readOutline(remdo);
    const first = outline[3]?.noteId;
    const second = outline[4]?.noteId;
    expect(first).toEqual(expect.any(String));
    expect(second).toEqual(expect.any(String));
    expect(first).not.toBe('note2');
    expect(second).not.toBe('note2');
    expect(first).not.toBe(second);
  });

  it('restores copied content when pasting over an edited note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' edited');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2 edited' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await selectStructuralNotes(remdo, 'note2');
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const outline = readOutline(remdo);
    expect(outline[1]?.noteId).toEqual(expect.any(String));
    expect(outline[1]?.noteId).not.toBe('note2');
  });

  it('marks structural cut clipboard payloads as cut', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const payload = (await cutSelection(remdo)) as { remdoCut?: boolean };
    expect(payload.remdoCut).toBe(true);
  });

  it('keeps inline text cuts within a single note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const note2Text = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetween(note2Text, 0, note2Text, 2);

    const payload = (await cutSelection(remdo)) as { remdoCut?: boolean };
    expect(payload.remdoCut).not.toBe(true);

    const outline = readOutline(remdo);
    expect(outline).toHaveLength(3);
    expect(outline[1]?.text).toBe('te2');
  });

  it('preserves noteIds when cutting and pasting back in place', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('preserves noteIds when cutting and pasting a note elsewhere', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('clears cut markers after a copy', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const cutPayload = await cutSelection(remdo);

    await selectStructuralNotes(remdo, 'note1');
    await copySelection(remdo);

    const expectedOutline = readOutline(remdo);

    // Paste uses the old cut payload instead of the new paste on purpose; with the marker cleared, it should be a no-op.
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, cutPayload);

    expect(remdo).toMatchOutline(expectedOutline);
  });

  it('replaces the cut marker with the most recent cut', meta({ fixture: 'flat' }), async ({ remdo }) => {
    //cut 1
    await selectStructuralNotes(remdo, 'note2');
    await cutSelection(remdo);
    //cut 2
    await selectStructuralNotes(remdo, 'note1');
    const cutPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);

    //paste cut 2
    await pastePayload(remdo, cutPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note1', text: 'note1' },
    ]);
  });

  it('clears cut markers after pasting a non-cut payload', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const cutPayload = await cutSelection(remdo);
    await selectStructuralNotes(remdo, 'note1');
    const copyPayload = await copySelection(remdo);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, copyPayload);

    const expectedOutline = readOutline(remdo);

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, cutPayload);

    expect(remdo).toMatchOutline(expectedOutline);
  });

  it('collapses structural selection after cutting multiple notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    await cutSelection(remdo);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('collapses multi-note inline selection after cut to the visual start', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note3', 'note2');
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
    });

    await cutSelection(remdo);

    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('drops cut markers after local edits', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' edited');

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2 edited' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('drops cut markers after local deletions', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Backspace' });

    const expectedOutline = [
      { noteId: 'note1', text: 'note1 note2' },
      { noteId: 'note3', text: 'note3' },
    ];
    await waitFor(() => {
      expect(remdo).toMatchOutline(expectedOutline);
    });

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline(expectedOutline);
  });

  it('drops cut markers after structural edits', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Tab' });

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);

    const expectedOutline = readOutline(remdo);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline(expectedOutline);
  });

  it('treats structural pastes inside a cut subtree as a no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    const expectedOutline = readOutline(remdo);

    await selectStructuralNotes(remdo, 'note2');
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline(expectedOutline);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('treats caret paste inside a cut subtree as a no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    const expectedOutline = readOutline(remdo);

    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline(expectedOutline);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
    ]);
  });

  it('treats a second paste after cut as a no-op', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    const expectedOutline = readOutline(remdo);

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline(expectedOutline);
  });
});

describe('note ids on split', () => {
  it('assigns a fresh noteId to the new sibling when splitting a note', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'no' },
      { noteId: 'note2', text: 'te2', children: [{ noteId: 'note3', text: 'note3' }] },
    ]);

    const outline = readOutline(remdo);
    const splitSibling = outline.find((node) => node.text === 'te2');
    expect(splitSibling?.noteId).toBeTruthy();
    expect(new Set(collectOutlineNoteIds(outline)).size).toBe(collectOutlineNoteIds(outline).length);
  });
});
