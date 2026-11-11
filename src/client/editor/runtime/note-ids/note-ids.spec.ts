import { $createListItemNode, $createListNode } from '@lexical/list';
import { $createParagraphNode, $createTextNode, $getRoot, $setState } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import { brokenEditorStates } from '#tests-common/broken-editor-states';
import { collectOutlineNoteIds } from '#tests-common/outline';
import {
  placeCaretAtNote,
  pressKey,
  readOutline,
  meta,
} from '#tests';
import { createNoteIdAvoiding } from '#domain/notes/ids';
import { noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { REORDER_NOTES_DOWN_COMMAND } from '#client/editor/foundation/commands';



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
  });

  it('preserves assigned noteIds on programmatic list items', async ({ remdo }) => {
    await remdo.mutate(() => {
      const root = $getRoot();
      root.clear();

      const list = $createListNode('bullet');
      const item = $createListItemNode();
      $setState(item, noteIdState, 'manualId');
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('note'));
      item.append(paragraph);
      list.append(item);
      root.append(list);
    });

    const outline = readOutline(remdo);
    const noteId = outline[0]?.noteId;
    expect(noteId).toBe('manualId');
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
      fixture: brokenEditorStates.missingNoteId(),
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant note-id-normalized missing-note-id path=0'],
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
      fixture: brokenEditorStates.duplicateNoteId(),
      fixtureSchemaBypass: true,
      expectedConsoleIssues: ['runtime.invariant note-id-normalized duplicate-note-id path=1'],
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
    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
      - note2
          - id:: note2
      - note3
          - id:: note3
    `);
  });
});

describe('note ids on structure changes', () => {
  it('keeps every note ID through a reorder, an indent and an outdent', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2');
    await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
          - note4
              - id:: note4
          - note2
              - id:: note2
              - note3
                  - id:: note3
      - note5
          - id:: note5
      - note6
          - id:: note6
          - note7
              - id:: note7
    `);

    await pressKey(remdo, { key: 'Tab' });
    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
          - note4
              - id:: note4
              - note2
                  - id:: note2
                  - note3
                      - id:: note3
      - note5
          - id:: note5
      - note6
          - id:: note6
          - note7
              - id:: note7
    `);

    await pressKey(remdo, { key: 'Tab', shift: true });
    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
          - note4
              - id:: note4
          - note2
              - id:: note2
              - note3
                  - id:: note3
      - note5
          - id:: note5
      - note6
          - id:: note6
          - note7
              - id:: note7
    `);
  });
});

describe('note ids on split', () => {
  it('keeps text order and unique ids when splitting the zoom root', meta({ fixture: 'flat', viewProps: { zoomNoteId: 'note2' } }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
      - no
          - id:: note2
          - te2
      - note3
          - id:: note3
    `);

    const outline = readOutline(remdo);
    const splitChild = outline[1]?.children?.find((node) => node.text === 'te2');
    expect(splitChild?.noteId).toEqual(expect.any(String));
    expect(splitChild?.noteId).not.toBe('note2');
    const noteIds = collectOutlineNoteIds(outline);
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it('assigns a fresh noteId to the new sibling when splitting a note', meta({ fixture: 'tree' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note2', 2);
    await pressKey(remdo, { key: 'Enter' });

    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
      - no
          - id:: note2
      - te2
          - note3
              - id:: note3
    `);

    const outline = readOutline(remdo);
    const splitSibling = outline.find((node) => node.text === 'te2');
    expect(splitSibling?.noteId).toBeTruthy();
    expect(splitSibling?.noteId).not.toBe('note2');
    expect(new Set(collectOutlineNoteIds(outline)).size).toBe(collectOutlineNoteIds(outline).length);
  });
});
