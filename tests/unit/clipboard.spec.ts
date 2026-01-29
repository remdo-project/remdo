import { describe, expect, it } from 'vitest';
import { createDataTransfer, meta, placeCaretAtNote, readCaretNoteId, readOutline, typeText } from '#tests';
import type { Outline, OutlineNode } from '#tests';
import { PASTE_COMMAND } from 'lexical';

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

  it.fails('pastes multi-line plain text at start as previous siblings and focuses the last note', meta({ fixture: 'flat' }), async ({ remdo }) => {
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

  it.fails('pastes multi-line plain text in the middle by splitting and inserting between', meta({ fixture: 'flat' }), async ({ remdo }) => {
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

  it.fails('pastes multi-line plain text at end as first children when the note has children', meta({ fixture: 'tree' }), async ({ remdo }) => {
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

  it.fails('pastes multi-line plain text at the start of a nested note as previous siblings', meta({ fixture: 'tree' }), async ({ remdo }) => {
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
});

async function pastePlainText(remdo: Parameters<typeof placeCaretAtNote>[0], text: string) {
  const data = createDataTransfer();
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: data });
  await remdo.dispatchCommand(PASTE_COMMAND, event);
}

function findOutlineNodeByText(outline: Outline, text: string): OutlineNode | null {
  for (const node of outline) {
    if (node.text === text) {
      return node;
    }
    if (node.children) {
      const match: OutlineNode | null = findOutlineNodeByText(node.children, text);
      if (match) {
        return match;
      }
    }
  }
  return null;
}
