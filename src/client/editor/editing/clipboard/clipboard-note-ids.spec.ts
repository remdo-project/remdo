import { $createListItemNode } from '@lexical/list';
import { describe, expect, it } from 'vitest';
import { $createTextNode, $isLineBreakNode, $isTextNode, $setState, UNDO_COMMAND } from 'lexical';
import { waitFor } from '@testing-library/react';

import type { SerializedLexicalNode, SerializedTextNode } from 'lexical';
import type { SerializedNoteLinkNode } from '#client/editor/features/links/note-link-node';
import type { SerializedNoteListItemNode } from '#client/editor/runtime/serialized-note-types';
import type { RemdoTestApi } from '#client/editor/dev';
import { collectOutlineNoteIds, flattenOutline } from '#tests-common/outline';
import {
  buildClipboardPayload,
  buildCustomClipboardPayload,
  collectSerializedNodes,
  copySelection,
  cutSelection,
  dragDomSelectionBetween,
  findSerializedNode,
  getNoteTextNode,
  getSerializedNodeChildren,
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
import { createUniqueNoteId } from '#domain/notes/ids';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getNoteBody } from '#client/editor/outline/selection/body-region';
import { $getOrCreateChildList } from '#client/editor/outline/list-structure';
import { $addNoteBody } from '#client/editor/features/note-body/note-body-ops';
import { noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { renderRemdoEditor } from '#tests-collab/render-editor';

function findSerializedListItem(node: SerializedLexicalNode, noteId: string): SerializedNoteListItemNode | null {
  return findSerializedNode([node], (candidate): candidate is SerializedNoteListItemNode => (
    candidate.type === 'listitem' && (candidate as SerializedNoteListItemNode).noteId === noteId
  ));
}

function findSerializedNoteLink(node: SerializedLexicalNode): SerializedNoteLinkNode | null {
  return findSerializedNode([node], (candidate): candidate is SerializedNoteLinkNode => (
    candidate.type === 'note-link'
  ));
}

function findSerializedNoteLinkInNodes(nodes: SerializedLexicalNode[] | undefined): SerializedNoteLinkNode | null {
  return findSerializedNode(nodes, (candidate): candidate is SerializedNoteLinkNode => (
    candidate.type === 'note-link'
  ));
}

function collectSerializedNoteLinksInNodes(nodes: SerializedLexicalNode[] | undefined): SerializedNoteLinkNode[] {
  return collectSerializedNodes(nodes, (candidate): candidate is SerializedNoteLinkNode => (
    candidate.type === 'note-link'
  ));
}

function collectSerializedListItems(nodes: SerializedLexicalNode[] | undefined): SerializedLexicalNode[] {
  return collectSerializedNodes(nodes, (candidate): candidate is SerializedLexicalNode => (
    candidate.type === 'listitem'
  ));
}

function cloneSerializedListItemByNoteId(remdo: RemdoTestApi, noteId: string): SerializedNoteListItemNode {
  const listNode = getSerializedRootListNode(remdo) as SerializedLexicalNode;
  const match = findSerializedListItem(listNode, noteId)!;
  return structuredClone(match);
}

function cloneWrapperAfterNoteId(remdo: RemdoTestApi, noteId: string): SerializedNoteListItemNode {
  const listNode = getSerializedRootListNode(remdo);
  const children = listNode.children as SerializedNoteListItemNode[];
  const index = children.findIndex((child) => child.type === 'listitem' && child.noteId === noteId);
  return structuredClone(children[index + 1]!);
}

function setSerializedText(node: SerializedLexicalNode, text: string): void {
  if (node.type === 'text') {
    (node as SerializedTextNode).text = text;
    return;
  }

  const children = getSerializedNodeChildren(node);
  for (const child of children) {
    if (child.type === 'text') {
      (child as SerializedTextNode).text = text;
      return;
    }
  }
}


function findOutlineNodeByText(outline: ReturnType<typeof readOutline>, text: string) {
  return flattenOutline(outline).find((node) => node.text === text) ?? null;
}

describe('note ids on paste', () => {
  it('assigns a fresh noteId when pasting a copied note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);
    expect((clipboardPayload as { remdo?: unknown }).remdo).toBeUndefined();
    expect(
      collectSerializedListItems(clipboardPayload.nodes as SerializedLexicalNode[])
        .every((item) => !('noteId' in item))
    ).toBe(true);
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
    expect(pastedNote?.noteId).not.toBe('note2');
    expect(new Set(noteIds).size).toBe(outline.length);
  });

  it('pasting a note over a body-text selection does not replace the owner note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A selection wholly inside note1's body is inline (the body is its own
    // region), so pasting a copied note must edit the body text, never run a
    // structural replace of note1. Regression: body-aware head resolution used to
    // map the body-local selection to a one-note structural head.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'bodytext');

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await copySelection(remdo);

    // Select all of note1's body text, then paste the copied note onto it.
    await remdo.mutate(() => {
      const body = getNoteBody($findNoteById('note1')!)!;
      body.select(0, body.getChildrenSize());
    });
    await pastePayload(remdo, clipboardPayload);

    // note1 survives (was not structurally replaced) and note2 is untouched.
    const outline = readOutline(remdo);
    expect(outline.find((note) => note.noteId === 'note1')).toBeDefined();
    expect(outline.find((note) => note.noteId === 'note2')?.text).toBe('note2');
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

  it('preserves a note link when a copied note is pasted into a body', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A body is rich text, so pasting copied note content into it must keep
    // inline rich nodes (note links, formatting) rather than flatten to plain
    // text. note1 gets a note link, is copied, then pasted into note3's body.
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note2');
    await pressKey(remdo, { key: 'Enter' });

    await selectStructuralNotes(remdo, 'note1');
    const clipboardPayload = await copySelection(remdo);

    // Give note3 a body and put the caret in it, then paste.
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pastePayload(remdo, clipboardPayload);

    // Two note links now exist: note1's original and the one preserved in the
    // body (not downgraded to plain text, which would leave only one).
    const rootListNode = getSerializedRootListNode(remdo) as SerializedLexicalNode;
    const links = collectSerializedNoteLinksInNodes([rootListNode]);
    expect(links.filter((link) => link.noteId === 'note2')).toHaveLength(2);
  });

  it('pastes only one structural note label into a body and preserves its formatting', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const source = $findNoteById('mixedFormatting')!;
      $addNoteBody(source).append($createTextNode('owned body'));

      const child = $createListItemNode();
      child.append($createTextNode('owned child'));
      $setState(child, noteIdState, 'ownedChild');
      $getOrCreateChildList(source).append(child);

      const destination = $findNoteById('underline')!;
      $addNoteBody(destination).append($createTextNode('destination '));
    });

    await selectNoteRange(remdo, 'mixedFormatting', 'ownedChild');
    await waitFor(() => {
      expect(remdo.editor.selection.isStructural()).toBe(true);
    });
    const clipboardPayload = await copySelection(remdo);
    expect(
      collectSerializedListItems(clipboardPayload.nodes as SerializedLexicalNode[])
        .every((item) => !('noteId' in item))
    ).toBe(true);

    await remdo.mutate(() => {
      getNoteBody($findNoteById('underline')!)!.selectEnd();
    });
    await pastePayload(remdo, clipboardPayload);

    const destinationBody = remdo.editor.getEditorState().read(() => {
      const body = getNoteBody($findNoteById('underline')!)!;
      return {
        text: body.getTextContent(),
        hasBoldLabelText: body.getChildren().some(
          (child) => $isTextNode(child) && child.getTextContent() === 'bold ' && child.hasFormat('bold')
        ),
      };
    });
    expect(destinationBody).toEqual({
      text: 'destination plain bold italic underline plain',
      hasBoldLabelText: true,
    });
  });

  it('pasting a multi-note payload into a body uses line breaks, not literal newlines', meta({ fixture: 'flat' }), async ({ remdo }) => {
    // A multi-note structural payload can't live in a body as structure, so it
    // flattens to text — but the body's line representation is LineBreakNodes,
    // not literal "\n" in a text node (the body line nav scans for LineBreakNode
    // children). Copy two notes, paste into note3's body, expect a line break.
    await selectNoteRange(remdo, 'note1', 'note2');
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
    });
    const clipboardPayload = await copySelection(remdo);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await pastePayload(remdo, clipboardPayload);

    const lineBreaks = remdo.editor.getEditorState().read(() => {
      const body = getNoteBody($findNoteById('note3')!)!;
      return body.getChildren().filter($isLineBreakNode).length;
    });
    expect(lineBreaks).toBeGreaterThan(0);
    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3', body: 'note1\nnote2' },
    ]);
  });

  it('materializes same-document note-link docId in clipboard payload', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await typeText(remdo, ' @note2');
    await pressKey(remdo, { key: 'Enter' });

    await selectStructuralNotes(remdo, 'note1');
    const clipboardPayload = await copySelection(remdo);
    const copiedLink = findSerializedNoteLinkInNodes(clipboardPayload.nodes as SerializedLexicalNode[])!;
    // Clipboard payload must be self-contained across browser contexts, so same-doc links carry docId here.
    expect(copiedLink.docId).toBe(remdo.getCollabDocId());
    expect(copiedLink.noteId).toBe('note2');

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    const copiedNotes = flattenOutline(readOutline(remdo)).filter((node) => node.text === 'note1 note2 ');
    const pastedNoteId = copiedNotes.at(-1)!.noteId!;
    const rootListNode = getSerializedRootListNode(remdo) as SerializedLexicalNode;
    const pastedListItem = findSerializedListItem(rootListNode, pastedNoteId)!;
    const pastedLink = findSerializedNoteLink(pastedListItem)!;
    expect(pastedLink.noteId).toBe('note2');
    expect(pastedLink.docId).toBe(remdo.getCollabDocId());
  });

  it(
    'regenerates noteIds for a cross-document cut while preserving source link targets',
    meta({ fixture: 'links' }),
    async ({ remdo }) => {
      const sourceDocId = remdo.getCollabDocId();
      await selectStructuralNotes(remdo, 'note1');
      const clipboardPayload = (await cutSelection(remdo)) as { nodes?: SerializedLexicalNode[] };

      expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'note1')).toBe(false);

      const clipboardLinks = collectSerializedNoteLinksInNodes(clipboardPayload.nodes);
      const sameDocClipboardLink = clipboardLinks.find((link) => link.noteId === 'note2')!;
      const crossDocClipboardLink = clipboardLinks.find((link) => link.noteId === 'remoteNote')!;
      expect(sameDocClipboardLink.docId).toBe(sourceDocId);
      expect(crossDocClipboardLink.docId).toBe('otherDoc');

      const destinationDocId = createUniqueNoteId();

      const { api: destination, unmount } = await renderRemdoEditor(destinationDocId);
      try {
        const insertionNoteId = readOutline(destination).at(-1)!.noteId!;
        await placeCaretAtNote(destination, insertionNoteId, Number.POSITIVE_INFINITY);
        await pastePayload(destination, clipboardPayload);

        const pastedNoteId = readOutline(destination).at(-1)!.noteId!;
        expect(pastedNoteId).not.toBe('note1');

        const rootListNode = getSerializedRootListNode(destination) as SerializedLexicalNode;
        const pastedListItem = findSerializedListItem(rootListNode, pastedNoteId)!;
        const pastedLinks = collectSerializedNoteLinksInNodes([pastedListItem]);
        const sameDocPastedLink = pastedLinks.find((link) => link.noteId === 'note2')!;
        const crossDocPastedLink = pastedLinks.find((link) => link.noteId === 'remoteNote')!;
        expect(sameDocPastedLink.docId).toBe(sourceDocId);
        expect(crossDocPastedLink.docId).toBe('otherDoc');
      } finally {
        unmount();
      }
    }
  );

  it('regenerates noteIds when pasting over a note range', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');

    const clipboardPayload = await copySelection(remdo);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const outline = readOutline(remdo);
    expect(outline[1]?.noteId).not.toBe('note2');
  });

  it('regenerates noteIds inside clipboard payloads that contain duplicates', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');

    const clipboardPayload = buildClipboardPayload(remdo, ['note2']);
    const listNode = clipboardPayload.nodes[0] as { children: SerializedLexicalNode[] };
    const firstChild = listNode.children[0]!;
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

    const nested = findSerializedListItem(wrapper, 'note2')!;
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

  it('regenerates ids when replacing multi-note ranges', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
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

    const nested = findSerializedListItem(wrapper, 'note2')!;
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
    expect(outline[1]?.noteId).not.toBe('note2');
  });

  it('keeps inline text cuts within a single note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const note2Text = getNoteTextNode(remdo, 'note2');
    await dragDomSelectionBetween(note2Text, 0, note2Text, 2);

    await cutSelection(remdo);

    const outline = readOutline(remdo);
    expect(outline).toHaveLength(3);
    expect(outline[1]?.text).toBe('te2');
  });

  it('pastes a structural cut into a body as inline content', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body ');

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);
    expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'note2')).toBe(false);

    await remdo.mutate(() => {
      getNoteBody($findNoteById('note1')!)!.selectEnd();
    });
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', body: 'body note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('removes a structural range immediately and round-trips the same gap exactly', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.waitForSynced();
    const initialState = remdo.getEditorState();

    await selectNoteRange(remdo, 'note1', 'note2');
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2'] });
    });

    const clipboardPayload = await cutSelection(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note3', text: 'note3' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });

    await pastePayload(remdo, clipboardPayload);
    await remdo.waitForSynced();
    expect(remdo).toMatchEditorState(initialState);
  });

  it('round-trips a sole child at its original parent gap', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await remdo.waitForSynced();
    const initialState = remdo.getEditorState();

    await selectStructuralNotes(remdo, 'note3');
    const clipboardPayload = await cutSelection(remdo);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
    ]);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });

    await pastePayload(remdo, clipboardPayload);
    await remdo.waitForSynced();

    expect(remdo).toMatchEditorState(initialState);
  });

  it('round-trips a tail sibling after the previous sibling subtree', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await remdo.waitForSynced();
    const initialState = remdo.getEditorState();

    await selectStructuralNotes(remdo, 'note4');
    const clipboardPayload = await cutSelection(remdo);

    expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'note4')).toBe(false);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note3' });

    await pastePayload(remdo, clipboardPayload);
    await remdo.waitForSynced();

    expect(remdo).toMatchEditorState(initialState);
  });

  it('round-trips formatted note content exactly', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    const initialState = remdo.getEditorState();

    await selectStructuralNotes(remdo, 'mixedFormatting');
    const clipboardPayload = await cutSelection(remdo);
    expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'mixedFormatting')).toBe(false);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchEditorState(initialState);
  });

  it('replaces the empty document placeholder when every note is cut and pasted back', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const initialState = remdo.getEditorState();

    await selectNoteRange(remdo, 'note1', 'note3');
    await waitFor(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note1', 'note2', 'note3'] });
    });
    const clipboardPayload = await cutSelection(remdo);
    expect(remdo).toMatchOutline([{ noteId: null }]);

    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchEditorState(initialState);
  });

  it('inserts multi-note cuts at a caret inside note text without replacing surrounding text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');
    const clipboardPayload = await cutSelection(remdo);

    expect(remdo).toMatchOutline([{ noteId: 'note1', text: 'note1' }]);

    await placeCaretAtNote(remdo, 'note1', 1);

    await pastePayload(remdo, clipboardPayload);

    // Expected: split at the caret offset and insert the cut notes between prefix/suffix.
    expect(remdo).toMatchOutline([
      { noteId: null, text: 'n' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note1', text: 'ote1' },
    ]);
  });

  it('moves a subtree away and back with exact editor-state round-trip', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    const initialState = remdo.getEditorState();

    await selectStructuralNotes(remdo, 'note6', 'note7');
    const firstCutPayload = await cutSelection(remdo);
    expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'note6' || note.noteId === 'note7')).toBe(false);

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, firstCutPayload);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
    ]);

    await selectStructuralNotes(remdo, 'note6', 'note7');
    const secondCutPayload = await cutSelection(remdo);
    expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'note6' || note.noteId === 'note7')).toBe(false);

    await placeCaretAtNote(remdo, 'note5', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, secondCutPayload);

    expect(remdo).toMatchEditorState(initialState);
  });

  it('regenerates colliding cut ids after undo restores the source', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.waitForSynced();
    const initialState = remdo.getEditorState();

    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);
    expect(flattenOutline(readOutline(remdo)).some((note) => note.noteId === 'note2')).toBe(false);

    await remdo.dispatchCommand(UNDO_COMMAND);
    await remdo.waitForSynced();
    expect(remdo).toMatchEditorState(initialState);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
      { noteId: null, text: 'note2' },
    ]);

    const outline = readOutline(remdo);
    const pastedId = outline.at(-1)?.noteId;
    expect(pastedId).toEqual(expect.any(String));
    expect(pastedId).not.toBe('note2');
    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('restores a cut source gap even when a collision regenerates its id', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note4');
    const clipboardPayload = await cutSelection(remdo);

    await remdo.mutate(() => {
      const collision = $createListItemNode();
      collision.append($createTextNode('collision'));
      $setState(collision, noteIdState, 'note4');
      $getOrCreateChildList($findNoteById('note5')!).append(collision);
    });
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: null, text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5', children: [{ noteId: 'note4', text: 'collision' }] },
      { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
    ]);

    const restoredId = findOutlineNodeByText(readOutline(remdo), 'note4')!.noteId;
    expect(restoredId).toEqual(expect.any(String));
    expect(restoredId).not.toBe('note4');
  });

  it('regenerates a same-document cut id that equals the document id', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = (await cutSelection(remdo)) as { nodes: SerializedLexicalNode[] };
    const pastedNote = findSerializedListItem(clipboardPayload.nodes[0]!, 'note2')!;
    pastedNote.noteId = remdo.getCollabDocId();

    await pastePayload(remdo, clipboardPayload);

    const outline = readOutline(remdo);
    const restoredNote = findOutlineNodeByText(outline, 'note2')!;
    expect(restoredNote.noteId).toEqual(expect.any(String));
    expect(restoredNote.noteId).not.toBe(remdo.getCollabDocId());
    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('regenerates every id in a same-document cut payload containing duplicates', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note1', 'note2');
    const clipboardPayload = (await cutSelection(remdo)) as { nodes: SerializedLexicalNode[] };
    const note1 = findSerializedListItem(clipboardPayload.nodes[0]!, 'note1')!;
    const note2 = findSerializedListItem(clipboardPayload.nodes[0]!, 'note2')!;
    note2.noteId = note1.noteId;

    await pastePayload(remdo, clipboardPayload);

    const outline = readOutline(remdo);
    const restoredNote1 = findOutlineNodeByText(outline, 'note1')!;
    const restoredNote2 = findOutlineNodeByText(outline, 'note2')!;
    expect(restoredNote1.noteId).not.toBe('note1');
    expect(restoredNote2.noteId).not.toBe('note1');
    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('regenerates the whole cut set when one incoming id collides', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note1', 'note2');
    const clipboardPayload = await cutSelection(remdo);

    await remdo.mutate(() => {
      const collision = $createListItemNode();
      collision.append($createTextNode('collision'));
      $setState(collision, noteIdState, 'note1');
      $findNoteById('note3')!.insertAfter(collision);
    });
    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);

    const outline = readOutline(remdo);
    const restoredNote1 = findOutlineNodeByText(outline, 'note1')!;
    const restoredNote2 = findOutlineNodeByText(outline, 'note2')!;
    expect(restoredNote1.noteId).not.toBe('note1');
    expect(restoredNote2.noteId).not.toBe('note2');
    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('preserves ids on the first same-document cut paste and regenerates them on repeat', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    const clipboardPayload = await cutSelection(remdo);
    expect((clipboardPayload as { remdo?: { sourceDocumentId?: string } }).remdo).toEqual(
      expect.objectContaining({ sourceDocumentId: remdo.getCollabDocId() })
    );
    expect(findSerializedListItem((clipboardPayload.nodes as SerializedLexicalNode[])[0]!, 'note2')).not.toBeNull();

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await placeCaretAtNote(remdo, 'note3', Number.POSITIVE_INFINITY);
    await pastePayload(remdo, clipboardPayload);
    await pastePayload(remdo, clipboardPayload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
      { noteId: null, text: 'note2' },
    ]);

    const outline = readOutline(remdo);
    const firstPasteId = outline[2]?.noteId;
    const repeatedPasteId = outline[3]?.noteId;
    expect(firstPasteId).toBe('note2');
    expect(repeatedPasteId).toEqual(expect.any(String));
    expect(repeatedPasteId).not.toBe('note2');
    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });
});
