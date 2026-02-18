import { describe, expect, it } from 'vitest';
import {
  createDataTransfer,
  buildClipboardPayload,
  getNoteKey,
  meta,
  pastePayload,
  placeCaretAtNote,
  placeCaretAtNoteTextNode,
  pressKey,
  readCaretNoteId,
  readOutline,
  selectEntireNote,
  selectStructuralNotes,
  typeText,
} from '#tests';
import type { Outline, OutlineNode } from '#tests';
import { flattenOutline } from '#tests-common/outline';
import type { ListItemNode } from '@lexical/list';
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $isTextNode,
  $setSelection,
  PASTE_COMMAND,
} from 'lexical';
import type { SerializedLexicalNode } from 'lexical';

describe('clipboard paste placement (docs/outliner/clipboard.md)', () => {
  it('pastes single-line plain text inline', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pastePlainText(remdo, 'X');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'noXte2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('pastes multi-line plain text at start as previous siblings and focuses the last note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pastePlainText(remdo, 'A\nB');
    await typeText(remdo, 'Z');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'A' },
      { noteId: null, text: 'BZ' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'BZ');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('pastes multi-line plain text in the middle by splitting and inserting between', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'no' },
      { noteId: null, text: 'A' },
      { noteId: null, text: 'B' },
      { noteId: 'note2', text: 'te2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('pastes multi-line plain text at end as first children when the note has children', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'note2',
        children: [
          { noteId: null, text: 'A' },
          { noteId: null, text: 'B' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('pastes multi-line plain text at the start of a nested note as previous siblings', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3', 0);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'note2',
        children: [
          { noteId: null, text: 'A' },
          { noteId: null, text: 'B' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('pastes multi-line plain text in the middle of a formatted note with multiple text nodes', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, 'mixedFormatting', 2, 2);
    await pastePlainText(remdo, 'A\nB');

    const texts = flattenOutline(readOutline(remdo)).map((node) => node.text ?? '');
    expect(texts).toEqual(['bold', 'italic', 'target', 'underline', 'plain bold it', 'A', 'B', 'alic underline plain']);

    const original = findOutlineNodeByText(readOutline(remdo), 'alic underline plain');
    expect(original?.noteId).toBe('mixedFormatting');

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('splits a formatted note when pasting at the start of a later text node', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, 'mixedFormatting', 1, 0);
    await pastePlainText(remdo, 'A\nB');

    const texts = flattenOutline(readOutline(remdo)).map((node) => node.text ?? '');
    expect(texts).toEqual(['bold', 'italic', 'target', 'underline', 'plain ', 'A', 'B', 'bold italic underline plain']);

    const original = findOutlineNodeByText(readOutline(remdo), 'bold italic underline plain');
    expect(original?.noteId).toBe('mixedFormatting');

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('keeps existing zoom-root descendants as direct children on middle multi-line paste', meta({ fixture: 'tree', editorProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      {
        noteId: 'note2',
        text: 'no',
        children: [
          { noteId: null, text: 'A' },
          { noteId: null, text: 'B' },
          { noteId: null, text: 'te2' },
          { noteId: 'note3', text: 'note3' },
        ],
      },
    ]);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('treats empty notes as start placement for multi-line pastes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    await placeCaretAtNote(remdo, 'note2', 0);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'A' },
      { noteId: null, text: 'B' },
      { noteId: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('replaces structural selections when pasting multi-line plain text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: null, text: 'A' },
      { noteId: null, text: 'B' },
      { noteId: 'note3', text: 'note3' },
    ]);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('replaces selected inline text while inserting notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'A', children: [{ noteId: null, text: 'B' }] },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it(
    'preserves unselected inline text and children when pasting multi-line plain text',
    meta({ fixture: 'tree' }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      const noteKey = getNoteKey(remdo, 'note2');

      await remdo.mutate(() => {
        const item = $getNodeByKey(noteKey) as ListItemNode;
        const textNode = item.getChildren().find($isTextNode)!;
        const selection = $createRangeSelection();
        selection.setTextNodeRange(textNode, 1, textNode, 3);
        $setSelection(selection);
      });

      expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

      await pastePlainText(remdo, 'A\nB');

      // NOTE: Pragmatic for now — we keep children intact and insert extra lines as first children,
      // even though the ordering is debatable. This may change as paste UX is refined.
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        {
          noteId: 'note2',
          text: 'nAe2',
          children: [
            { noteId: null, text: 'B' },
            { noteId: 'note3', text: 'note3' },
          ],
        },
      ]);
    }
  );

  it.fails('pastes inline non-list clipboard payloads as text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    // Use a non-list payload to mirror external Lexical clipboard data (no list items).
    // Plain-text pastes (no lexical payload) already work; this guards the edge case
    // where a Lexical payload arrives with non-list nodes, which used to become a no-op.
    let payload!: { namespace: string; nodes: SerializedLexicalNode[] };
    await remdo.mutate(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('pasted'));
      payload = {
        namespace: (remdo.editor as { _config?: { namespace?: string } })._config?.namespace ?? 'remdo',
        nodes: [paragraph.exportJSON()],
      };
    });

    await pastePayload(remdo, payload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'pasted' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('preserves note ids when pasting a note payload over an inline selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    const payload = buildClipboardPayload(remdo, ['note2']);
    await pastePayload(remdo, payload);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ]);
  });
});

async function pastePlainText(remdo: Parameters<typeof placeCaretAtNote>[0], text: string) {
  const data = createDataTransfer();
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: data });
  await remdo.dispatchCommand(PASTE_COMMAND, event);
}

function findOutlineNodeByText(outline: Outline, text: string): OutlineNode | null {
  return flattenOutline(outline).find((node) => node.text === text) ?? null;
}
