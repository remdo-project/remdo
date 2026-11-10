import { $getNoteById, $getNoteByText,
  placeCaretAtNote,
  placeCaretAtNoteTextNode,
  pressKey,
  readCaretNoteId,
  setRawNoteCheckedState,
  selectAcrossNoteTextNodes,
  selectEntireNote,
  selectNoteTextRange,
  typeText,
  meta } from '#tests';
import { describe, expect, it } from 'vitest';
import { $createTextNode, $getSelection, $isTextNode, UNDO_COMMAND } from 'lexical';
import type { $createRangeSelection } from 'lexical';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $setNoteFolded } from '#client/editor/outline/fold-state';
import { $createDateNode } from '#client/editor/features/date/date-node';
import { $isNoteLinkNode } from '#client/editor/features/links/note-link-node';

describe('insertion semantics (docs/insertion.md)', () => {
  it('enter at start inserts a previous sibling and keeps children with the original', meta({ fixture: 'basic' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - X
          - id:: ${newNoteId}
      - note1
          - note2
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter in the middle keeps the leading identity while trailing text becomes a fresh sibling', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note1', 2);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - no
          - id:: note1
      - Xte1
          - id:: ${trailingNoteId}
      - note2
          - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
  });

  it('enter at the start of a later text node splits the note (multi-text)', meta({ fixture: 'formatted' }), async ({ remdo }) => {
    await placeCaretAtNoteTextNode(remdo, { id: 'mixedFormatting' }, 1, 0);

    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline(`
      - bold
          - italic
              - target
      - underline
      - plain&#32;
          - id:: mixedFormatting
      - bold italic underline plain
          - id:: ${trailingNoteId}
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
  });

  it('enter at end creates a first child and focuses it', meta({ fixture: 'basic' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);

    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
          - X
              - id:: ${newNoteId}
          - note2
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end of a folded parent inserts a next sibling', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $getNoteByText('note1');
      $setNoteFolded(note, true);
    });

    await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
          - folded:: true
          - note2
      - X
          - id:: ${newNoteId}
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end of the zoom root inserts a first child', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - X
              - id:: ${newNoteId}
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at start of the zoom root inserts a first child', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - X
              - id:: ${newNoteId}
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter in the middle of the zoom root splits into a first child and moves focus to that child', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const newChildId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline(`
      - note1
      - no
          - id:: note2
          - te2
              - id:: ${newChildId}
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newChildId });
  });

  it('moves zoom-root state and descendants to the trailing first child and restores them on Backspace', meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $getNoteByText('note2');
      note.clear();
      note.append($createTextNode('left right'));
    });
    await placeCaretAtNote(remdo, 'left right', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    await setRawNoteCheckedState(remdo, 'left right', true);
    await setRawNoteCheckedState(remdo, 'note3', true);
    await remdo.mutate(() => {
      $setNoteFolded($getNoteById('note2'), true);
    });

    await placeCaretAtNote(remdo, 'left right', 5);
    await pressKey(remdo, { key: 'Enter' });
    const splitChildId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline(`
      - note1
      - [x] left&#32;
          - id:: note2
          - right
              > body
              - id:: ${splitChildId}
              - folded:: true
              - [x] note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: splitChildId });

    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline(`
      - note1
      - [x] left right
          > body
          - id:: note2
          - folded:: true
          - [x] note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('enter is a no-op in structural mode', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2');
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    await pressKey(remdo, { key: 'a', ctrlOrMeta: true });
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });

    const before = remdo.getEditorState();
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchEditorState(before);
    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('enter split inside a nested note inserts a fresh trailing sibling at the same depth', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - no
          - id:: note2
      - Xte2
          - id:: ${trailingNoteId}
          - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
  });

  it('enter at end inserts new first child ahead of existing children', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note2', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - X
              - id:: ${newNoteId}
          - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at start of nested note inserts previous sibling at same depth', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note3', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - note2
          - X
              - id:: ${newNoteId}
          - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at end on a leaf note inserts a next sibling and focuses it', meta({ fixture: 'tree' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note1', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
      - X
          - id:: ${newNoteId}
      - note2
          - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter at start when the previous sibling has children inserts a new sibling above and keeps that subtree intact', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
        await placeCaretAtNote(remdo, 'note4', 0);
    await pressKey(remdo, { key: 'Enter' });
    const newNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
          - note2
              - note3
          - X
              - id:: ${newNoteId}
          - note4
      - note5
      - note6
          - note7
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: newNoteId });
  });

  it('enter in the middle of a note with descendants keeps the subtree on the trailing segment', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);
    await typeText(remdo, 'X');

    expect(remdo).toMatchOutline(`
      - note1
          - no
              - id:: note2
          - Xte2
              - id:: ${trailingNoteId}
              - note3
          - note4
      - note5
      - note6
          - note7
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
  });

  it('moves body, descendants, and fold state to the fresh suffix while keeping identity and checked state leading', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $getNoteByText('note2');
      note.clear();
      note.append($createTextNode('left right'));
    });
    await placeCaretAtNote(remdo, 'left right', Number.POSITIVE_INFINITY);
    await pressKey(remdo, { key: 'Enter', shift: true });
    await typeText(remdo, 'body');
    await setRawNoteCheckedState(remdo, 'left right', true);
    await setRawNoteCheckedState(remdo, 'note3', true);
    await remdo.mutate(() => {
      $setNoteFolded($getNoteById('note2'), true);
    });

    await placeCaretAtNote(remdo, 'left right', 5);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline(`
      - note1
      - [x] left&#32;
          - id:: note2
      - right
          > body
          - id:: ${trailingNoteId}
          - folded:: true
          - [x] note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });

    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline(`
      - note1
      - [x] left right
          > body
          - id:: note2
          - folded:: true
          - [x] note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note2' });
  });

  it('restores a whitespace-leading split without retiring the original identity', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      const note = $getNoteByText('note1');
      note.clear();
      note.append($createTextNode(' note'));
    });
    await setRawNoteCheckedState(remdo, { id: 'note1' }, true);

    await placeCaretAtNote(remdo, { id: 'note1' }, 1);
    await pressKey(remdo, { key: 'Enter' });
    const trailingNoteId = readCaretNoteId(remdo);

    expect(remdo).toMatchOutline(`
      - [x] &#32;
          - id:: note1
      - note
          - id:: ${trailingNoteId}
      - note2
      - note3
    `);

    await pressKey(remdo, { key: 'Backspace' });

    expect(remdo).toMatchOutline(`
      - [x] &#32;note
          - id:: note1
      - note2
      - note3
    `);
    expect(remdo).toMatchSelection({ state: 'caret', note: 'note1' });
  });

  describe('inline text selection', () => {
    it('removes the selected text and splits as a middle caret would', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline(`
        - no
            - id:: note1
        - X1
            - id:: ${trailingNoteId}
        - note2
            - note3
      `);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
    });

    it('keeps the noteId leading and moves children to the fresh trailing note', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note2', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - note1
            - no
                - id:: note2
            - 2
                - id:: ${trailingNoteId}
                - note3
            - note4
        - note5
        - note6
            - note7
      `);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
    });

    it('applies the start rule when the selection touches the note start', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 0, 2);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline(`
        - X
        - te1
            - id:: note1
        - note2
            - note3
      `);
    });

    it('applies the end rule when the selection touches the note end', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 3, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      const newNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline(`
        - not
            - id:: note1
        - X
            - id:: ${newNoteId}
        - note2
            - note3
      `);
    });

    it('clears the note and applies the end rule when the whole text is selected', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note1');
      await pressKey(remdo, { key: 'Enter' });
      const newNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline(`
        -
            - id:: note1
        - X
            - id:: ${newNoteId}
        - note2
            - note3
      `);
    });

    it('creates a first child when the whole text of a parent is selected', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
      await selectEntireNote(remdo, 'note2');
      await pressKey(remdo, { key: 'Enter' });
      const newNoteId = readCaretNoteId(remdo);
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline(`
        - note1

            -
                - id:: note2
                - X
                    - id:: ${newNoteId}
                - note3
            - note4
        - note5
        - note6
            - note7
      `);
    });

    it('splits when the selection spans several text nodes', meta({ fixture: 'formatted' }), async ({ remdo }) => {
      await selectAcrossNoteTextNodes(remdo, { id: 'mixedFormatting' }, 0, 3, 2, 3);
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - bold
            - italic
                - target
        - underline
        - pla
            - id:: mixedFormatting
        - lic underline plain
            - id:: ${trailingNoteId}
      `);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
    });

    it('inserts a note when removal leaves only a decorator', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        $getNoteByText('note1').append($createDateNode('2026-01-02'));
      });
      await selectNoteTextRange(remdo, { id: 'note1' }, 0, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      await typeText(remdo, 'X');

      expect(remdo).toMatchOutline(`
        - X
        - Jan 2, 2026
            - id:: note1
        - note2
            - note3
      `);
    });

    it('splits between decorators when removal empties the text between them', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const item = $getNoteByText('note1');
        item.clear();
        item.append($createDateNode('2026-01-02'));
        item.append($createTextNode('mid'));
        item.append($createDateNode('2026-03-04'));
      });
      await selectNoteTextRange(remdo, { id: 'note1' }, 0, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - Jan 2, 2026
            - id:: note1
        - Mar 4, 2026
            - id:: ${trailingNoteId}
        - note2
            - note3
      `);
    });

    it('splits a link at the exact caret after removing a selection inside it', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const note = $getNoteByText('note1');
        note.clear();
        const link = $createLinkNode('https://example.com/', {
          rel: 'noopener',
          target: '_blank',
          title: 'Example',
        });
        link.append($createTextNode('linktext'));
        note.append($createTextNode('before '));
        note.append(link);
        note.append($createTextNode(' after'));
      });
      await placeCaretAtNote(remdo, { id: 'note1' }, 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const link = $getNoteById('note1').getChildren().find($isLinkNode)!;
        const linkText = link.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 2, linkText, 6);
      });
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - before li
            - id:: note1
        - xt after
            - id:: ${trailingNoteId}
        - note2
            - note3
      `);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
      remdo.validate(() => {
        const leadingLink = $getNoteById('note1').getChildren().find($isLinkNode)!;
        const trailingLink = $getNoteById(trailingNoteId).getChildren().find($isLinkNode)!;
        expect(leadingLink.getURL()).toBe('https://example.com/');
        expect(trailingLink.getURL()).toBe('https://example.com/');
        expect(leadingLink.getRel()).toBe('noopener noreferrer');
        expect(trailingLink.getRel()).toBe(leadingLink.getRel());
        expect(leadingLink.getTarget()).toBe('_blank');
        expect(trailingLink.getTarget()).toBe('_blank');
        expect(leadingLink.getTitle()).toBe('Example');
        expect(trailingLink.getTitle()).toBe('Example');
      });
    });

    it('preserves a note-link target on both sides of an exact split', meta({ fixture: 'links' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, { id: 'note1' }, 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const noteLink = $getNoteById('note1').getChildren().find($isNoteLinkNode)!;
        const linkText = noteLink.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 2, linkText, 2);
      });

      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - same no
            - id:: note1
        - te2 cross /n/otherDoc_remoteNote
            - id:: ${trailingNoteId}
        - note2
        - note3
      `);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
      remdo.validate(() => {
        const leadingLink = $getNoteById('note1').getChildren().find($isNoteLinkNode)!;
        const trailingLink = $getNoteById(trailingNoteId).getChildren().find($isNoteLinkNode)!;
        expect(leadingLink.getLinkRef()).toEqual(trailingLink.getLinkRef());
        expect(leadingLink.getNoteId()).toBe('note2');
      });
    });

    it('splits after a link when following text remains', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await remdo.mutate(() => {
        const note = $getNoteByText('note1');
        note.clear();
        const link = $createLinkNode('https://example.com/');
        link.append($createTextNode('link'));
        note.append($createTextNode('before '), link, $createTextNode(' after'));
      });
      await placeCaretAtNote(remdo, { id: 'note1' }, 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const link = $getNoteById('note1').getChildren().find($isLinkNode)!;
        const linkText = link.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 4, linkText, 4);
      });
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - before link
            - id:: note1
        - &#32;after
            - id:: ${trailingNoteId}
        - note2
            - note3
      `);
      expect(remdo).toMatchSelection({ state: 'caret', note: trailingNoteId });
      remdo.validate(() => {
        const link = $getNoteById('note1').getChildren().find($isLinkNode)!;
        expect(link.getURL()).toBe('https://example.com/');
      });
    });

    it('deletes a selection ending at a link boundary and splits in one undo step', meta({ fixture: 'links' }), async ({ remdo }) => {
      await placeCaretAtNote(remdo, { id: 'note1' }, 0);
      await remdo.mutate(() => {
        const selection = $getSelection() as ReturnType<typeof $createRangeSelection>;
        const link = $getNoteById('note1').getChildren().find($isNoteLinkNode)!;
        const linkText = link.getChildren().filter($isTextNode)[0]!;
        selection.setTextNodeRange(linkText, 2, linkText, 5);
      });
      await pressKey(remdo, { key: 'Enter' });
      const trailingNoteId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - same no
            - id:: note1
        - &#32;cross /n/otherDoc_remoteNote
            - id:: ${trailingNoteId}
        - note2
        - note3
      `);

      await remdo.dispatchCommand(UNDO_COMMAND);

      expect(remdo).toMatchOutline(`
        - same note2 cross /n/otherDoc_remoteNote
            - id:: note1
        - note2
        - note3
      `);
    });

    it('leaves shift+enter to the note body, keeping the selected text', meta({ fixture: 'tree' }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note1', 2, 4);
      await pressKey(remdo, { key: 'Enter', shift: true });
      await typeText(remdo, 'in body');

      expect(remdo).toMatchOutline(`
        - note1
            > in body
        - note2
            - note3
      `);
    });

    it('keeps insertion inside the zoom boundary', meta({ fixture: 'tree', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
      await selectNoteTextRange(remdo, 'note2', 2, 4);
      await pressKey(remdo, { key: 'Enter' });
      const newChildId = readCaretNoteId(remdo);

      expect(remdo).toMatchOutline(`
        - note1
        - no
            - id:: note2
            - 2
                - id:: ${newChildId}
                - note3
      `);
    });
  });
});
