import { $getNoteById, $getNoteByText,
  createDataTransfer,
  buildClipboardPayload,
  copySelection,
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
  typeText } from '#tests';
import { describe, expect, it } from 'vitest';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import type { Outline, OutlineNode } from '#tests';
import { flattenOutline } from '#tests-common/outline';
import type { ListItemNode } from '@lexical/list';
import {
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $isTextNode,
  $setSelection,
  PASTE_COMMAND,
} from 'lexical';
import { SET_NOTE_FOLD_COMMAND } from '#client/editor/foundation/commands';

describe('clipboard paste placement (docs/specs/outliner/clipboard.md)', () => {
  it('pastes single-line plain text inline', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pastePlainText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - noXte2
          - id:: note2
      - note3
    `);
  });

  it('pastes multi-line plain text at start as previous siblings and focuses the last note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pastePlainText(remdo, 'A\nB');
    await typeText(remdo, 'Z');

    expect(remdo).toMatchOutline(`
      - note1
      - A
      - BZ
      - note2
      - note3
    `);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'BZ');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('pastes multi-line plain text in the middle by splitting and inserting between', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - no
          - id:: note2
      - A
      - B
      - te2
      - note3
    `);
  });

  it('pastes between a link boundary and following text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $getNoteByText('note2');
      note.clear();
      const link = $createLinkNode('https://example.com/');
      link.append($createTextNode('link'));
      note.append(link, $createTextNode(' after'));
    });
    await placeCaretAtNote(remdo, { id: 'note2' }, 0);
    await remdo.mutate(() => {
      const link = $getNoteById('note2').getChildren().find($isLinkNode)!;
      const linkText = link.getChildren().filter($isTextNode)[0]!;
      const selection = $createRangeSelection();
      selection.setTextNodeRange(linkText, 4, linkText, 4);
      $setSelection(selection);
    });

    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - link
          - id:: note2
      - A
      - B
      - &#32;after
      - note3
    `);
    remdo.validate(() => {
      const link = $getNoteById('note2').getChildren().find($isLinkNode)!;
      expect(link.getURL()).toBe('https://example.com/');
    });

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('pastes multi-line plain text at end as first children when the note has children', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - A
          - B
          - note3
    `);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('auto-expands a folded note when pasting at its end (docs/specs/outliner/folding.md)', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, { state: 'folded', noteItemKey: getNoteKey(remdo, 'note2') });
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - A
          - B
          - note3
    `);
  });

  it('pastes multi-line plain text at the start of a nested note as previous siblings', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3', 0);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - A
          - B
          - note3
    `);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('pastes multi-line plain text in the middle of a formatted note with multiple text nodes', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, { id: 'mixedFormatting' }, 2, 2);
    await pastePlainText(remdo, 'A\nB');

    const texts = flattenOutline(readOutline(remdo)).map((node) => node.text ?? '');
    expect(texts).toEqual(['bold', 'italic', 'target', 'underline', 'plain bold it', 'A', 'B', 'alic underline plain']);

    const original = findOutlineNodeByText(readOutline(remdo), 'plain bold it');
    expect(original?.noteId).toBe('mixedFormatting');

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('splits a formatted note when pasting at the start of a later text node', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, { id: 'mixedFormatting' }, 1, 0);
    await pastePlainText(remdo, 'A\nB');

    const texts = flattenOutline(readOutline(remdo)).map((node) => node.text ?? '');
    expect(texts).toEqual(['bold', 'italic', 'target', 'underline', 'plain ', 'A', 'B', 'bold italic underline plain']);

    const original = findOutlineNodeByText(readOutline(remdo), 'plain ');
    expect(original?.noteId).toBe('mixedFormatting');

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('keeps zoom-root descendants with the trailing note on middle multi-line paste', meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - no
          - id:: note2
          - A
          - B
          - te2
              - note3
    `);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('treats empty notes as start placement for multi-line pastes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline(`
      - note1
      -
          - id:: note2
      - note3
    `);

    await placeCaretAtNote(remdo, { id: 'note2' }, 0);
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - A
      - B
      -
          - id:: note2
      - note3
    `);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it('replaces note ranges when pasting multi-line plain text', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2');
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - A
      - B
      - note3
    `);

    const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
    expect(focusNote?.noteId).toBeTruthy();
    expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
  });

  it(
    'keeps structural paste replacements inside the zoom boundary when the zoom root is selected',
    meta({ fixture: 'tree-complex', viewProps: { zoomNoteId: 'note2' } }),
    async ({ remdo }) => {
      await placeCaretAtNote(remdo, 'note2');
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

      await pastePlainText(remdo, 'A\nB');

      expect(remdo).toMatchOutline(`
        - note1
            - note2
                - A
                - B
            - note4
        - note5
        - note6
            - note7
      `);

      const focusNote = findOutlineNodeByText(readOutline(remdo), 'B');
      expect(focusNote?.noteId).toBeTruthy();
      expect(readCaretNoteId(remdo)).toBe(focusNote?.noteId);
    }
  );

  it('replaces selected inline text while inserting notes', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    await pastePlainText(remdo, 'A\nB');

    expect(remdo).toMatchOutline(`
      - note1
      - A
          - id:: note2
          - B
      - note3
    `);
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
      expect(remdo).toMatchOutline(`
        - note1
        - nAe2
            - id:: note2
            - B
            - note3
      `);
    }
  );

  it('preserves inline external links when copying and pasting inside the editor', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const linkNode = $createLinkNode('https://example.com/');
      linkNode.append($createTextNode('Example'));
      const note = $getNoteByText('note2');
      note.clear();
      note.append(linkNode);
    });

    await selectEntireNote(remdo, { id: 'note2' });
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });
    const payload = await copySelection(remdo);

    await selectEntireNote(remdo, 'note1');
    await pastePayload(remdo, payload);

    remdo.validate(() => {
      const note = $getNoteById('note1');
      expect(note.getTextContent()).toBe('Example');
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('Example');
      expect(linkNode.getURL()).toBe('https://example.com/');
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('preserves partially selected inline external links when copying and pasting inside the editor', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const linkNode = $createLinkNode('https://example.com/');
      const linkText = $createTextNode('Example');
      linkNode.append(linkText);
      const note = $getNoteByText('note2');
      note.clear();
      note.append(linkNode, $createTextNode(' tail'));

      const selection = $createRangeSelection();
      selection.setTextNodeRange(linkText, 0, linkText, linkText.getTextContentSize());
      $setSelection(selection);
    });

    const payload = await copySelection(remdo);

    await selectEntireNote(remdo, 'note1');
    await pastePayload(remdo, payload);

    remdo.validate(() => {
      const note = $getNoteById('note1');
      expect(note.getTextContent()).toBe('Example');
      const linkNode = note.getChildren().find($isLinkNode)!;
      expect(linkNode.getTextContent()).toBe('Example');
      expect(linkNode.getURL()).toBe('https://example.com/');
      expect(linkNode.getTarget()).toBe('_blank');
      expect(linkNode.getRel()).toBe('noopener noreferrer');
    });
  });

  it('preserves note ids when pasting a note payload over an inline selection', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectEntireNote(remdo, 'note2');
    expect(remdo).toMatchSelection({ state: 'inline', note: 'note2' });

    const payload = buildClipboardPayload(remdo, ['note2']);
    await pastePayload(remdo, payload);

    expect(remdo).toMatchOutline(`
      - note1
      - note2
      - note3
    `);
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
