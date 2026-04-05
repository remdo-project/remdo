import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote, readOutline, selectNoteRange } from '#tests';
import { createLexicalEditorNotes } from '@/editor/notes';
import { NoteNotFoundError } from '@/notes/errors';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { removeNoteSubtree } from '@/editor/outline/selection/tree';

describe('editor notes', () => {
  it('resolves note reads and document context', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const result = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note = sdk.note('note2');

      return {
        docId: sdk.docId(),
        noteId: note.id(),
        text: note.text(),
        childIds: note.children().map((child) => child.id()),
      };
    });

    expect(result.docId).toBe(remdo.getCollabDocId());
    expect(result.noteId).toBe('note2');
    expect(result.text).toBe('note2');
    expect(result.childIds).toEqual(['note3']);
  });

  it('resolves caret selection from current editor selection state', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await placeCaretAtNote(remdo, 'note3');

    const selection = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.selection();
    });

    if (selection.kind !== 'caret') {
      throw new Error(`Expected caret selection, got ${selection.kind}`);
    }
    expect(selection.range.start).toBe('note3');
    expect(selection.range.end).toBe('note3');
  });

  it('resolves structural selection range', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note3');

    const selection = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.selection();
    });

    if (selection.kind !== 'structural') {
      throw new Error(`Expected structural selection, got ${selection.kind}`);
    }
    expect(selection.range.start).toBe('note2');
    expect(selection.range.end).toBe('note3');
  });

  it(
    'falls back to structural selection range when outline selection store is unavailable',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await selectNoteRange(remdo, 'note2', 'note3');

      const originalGet = remdo.editor.selection.get;
      remdo.editor.selection.get = () => null;

      try {
        const result = remdo.validate(() => {
          const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
          const selection = sdk.selection();
          if (selection.kind !== 'structural') {
            throw new Error(`Expected structural selection, got ${selection.kind}`);
          }
          return {
            start: selection.range.start,
            end: selection.range.end,
          };
        });

        expect(result).toEqual({ start: 'note2', end: 'note3' });
      } finally {
        remdo.editor.selection.get = originalGet;
      }
    }
  );

  it(
    'falls back to structural selection for parent-to-descendant range with a single-point range',
    meta({ fixture: 'tree-complex' }),
    async ({ remdo }) => {
      await selectNoteRange(remdo, 'note2', 'note3');

      const originalGet = remdo.editor.selection.get;
      remdo.editor.selection.get = () => null;

      try {
        const result = remdo.validate(() => {
          const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
          const selection = sdk.selection();
          if (selection.kind !== 'structural') {
            throw new Error(`Expected structural selection, got ${selection.kind}`);
          }
          return {
            start: selection.range.start,
            end: selection.range.end,
          };
        });

        expect(result).toEqual({ start: 'note2', end: 'note2' });
      } finally {
        remdo.editor.selection.get = originalGet;
      }
    }
  );

  it('returns false for domain no-ops while preserving valid moves', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let outcomes: { indentOne: boolean; indentTwo: boolean; outdentOne: boolean; outdentTwo: boolean } | null = null;

    await remdo.mutate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      outcomes = {
        indentOne: sdk.indent({ start: 'note2', end: 'note2' }),
        indentTwo: sdk.indent({ start: 'note2', end: 'note2' }),
        outdentOne: sdk.outdent({ start: 'note2', end: 'note2' }),
        outdentTwo: sdk.outdent({ start: 'note2', end: 'note2' }),
      };
    });

    expect(outcomes).toEqual({
      indentOne: true,
      indentTwo: false,
      outdentOne: true,
      outdentTwo: false,
    });
  });

  it('moves ranges before and after targets', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let moved = false;

    await remdo.mutate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });

      sdk.place({ start: 'note3', end: 'note3' }, { before: 'note2' });
      sdk.place({ start: 'note1', end: 'note1' }, { after: 'note2' });
      moved = true;
    });

    expect(moved).toBe(true);
    expect(remdo).toMatchOutline([
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note1', text: 'note1' },
    ]);
  });

  it('creates and places a note through parent-owned create()', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let inserted:
      | {
          placedId: string;
          placedText: string;
          attachedAfterPlace: boolean;
        }
      | null = null;

    await remdo.mutate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const placed = sdk.note('note1').create({ index: 999 }, 'draft');
      inserted = {
        placedId: placed.id(),
        placedText: placed.text(),
        attachedAfterPlace: placed.attached(),
      };
    });

    expect(inserted).not.toBeNull();
    expect(inserted!.placedId.length).toBeGreaterThan(0);
    expect(inserted!.placedText).toBe('draft');
    expect(inserted!.attachedAfterPlace).toBe(true);
    const outline = readOutline(remdo);
    expect(outline[0]?.text).toBe('note1');
    expect(outline[0]?.children?.[0]?.text).toBe('draft');
    expect(outline[1]?.text).toBe('note2');
    expect(outline[2]?.text).toBe('note3');
  });

  it('moves notes into parent by index with negative and clamped indexing', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    let moved = false;

    await remdo.mutate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });

      sdk.place({ start: 'note5', end: 'note5' }, { parent: 'note1', index: -2 });
      sdk.place({ start: 'note6', end: 'note6' }, { parent: 'note1', index: 999 });
      moved = true;
    });

    expect(moved).toBe(true);
    expect(remdo).toMatchOutline([
      {
        noteId: 'note1', text: 'note1', children: [
          { noteId: 'note2', text: 'note2', children: [{ noteId: 'note3', text: 'note3' }] },
          { noteId: 'note5', text: 'note5' },
          { noteId: 'note4', text: 'note4' },
          { noteId: 'note6', text: 'note6', children: [{ noteId: 'note7', text: 'note7' }] },
        ],
      },
    ]);
  });

  it('throws for place targets that would be no-op or use invalid ranges', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let result:
      | {
          beforeSelf: string;
          afterSelf: string;
          beforeOther: string;
          reversedRange: string;
        }
      | null = null;

    remdo.editor.update(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const captureError = (run: () => unknown): string => {
        try {
          run();
          return 'no-throw';
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      };

      result = {
        beforeSelf: captureError(() => sdk.place({ start: 'note2', end: 'note2' }, { before: 'note2' })),
        afterSelf: captureError(() => sdk.place({ start: 'note2', end: 'note2' }, { after: 'note2' })),
        beforeOther: captureError(() => sdk.place({ start: 'note2', end: 'note2' }, { before: 'note3' })),
        reversedRange: captureError(() => sdk.place({ start: 'note3', end: 'note2' }, { before: 'note1' })),
      };
    });

    expect(result).toEqual({
      beforeSelf: 'Cannot place notes before themselves',
      afterSelf: 'Cannot place notes after themselves',
      beforeOther: 'place() target would be a no-op',
      reversedRange: 'place() expects a contiguous sibling range',
    });
    expect(readOutline(remdo).map((node) => node.noteId)).toEqual(['note1', 'note2', 'note3']);
  });

  it('throws when move target no longer exists', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let errorMessage = '';

    remdo.editor.update(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      removeNoteSubtree($findNoteById('note2')!);

      try {
        sdk.place({ start: 'note3', end: 'note3' }, { before: 'note2' });
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    });

    expect(errorMessage).toBe('Note not found: note2');
  });

  it('throws for illegal ancestry and non-sibling ranges', meta({ fixture: 'tree' }), async ({ remdo }) => {
    let outcomes: { descendant: string; nonSibling: string } | null = null;

    remdo.editor.update(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });

      const captureError = (run: () => unknown): string => {
        try {
          run();
          return 'no-throw';
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      };

      outcomes = {
        descendant: captureError(() => sdk.place({ start: 'note2', end: 'note2' }, { before: 'note3' })),
        nonSibling: captureError(() => sdk.place({ start: 'note2', end: 'note3' }, { after: 'note2' })),
      };
    });

    expect(outcomes).toEqual({
      descendant: 'Cannot move notes relative to their own descendants',
      nonSibling: 'place() expects a contiguous sibling range',
    });
  });

  it('throws from reads and operations once a note is deleted', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const note = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.note('note2');
    });

    await remdo.mutate(() => {
      removeNoteSubtree($findNoteById('note2')!);
    });

    remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      expect(note.attached()).toBe(false);
      expect(() => note.text()).toThrow(NoteNotFoundError);
      expect(() => note.children()).toThrow(NoteNotFoundError);
      expect(() => sdk.indent({ start: 'note2', end: 'note2' })).toThrow(NoteNotFoundError);
      expect(() => sdk.moveUp({ start: 'note2', end: 'note2' })).toThrow(NoteNotFoundError);
    });
  });

  it('throws when used outside lexical read/update context', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const sdkAndNote = remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return { sdk, note: sdk.note('note2') };
    });

    expect(() => sdkAndNote.note.text()).toThrow();
    expect(() => sdkAndNote.sdk.indent({ start: 'note2', end: 'note2' })).toThrow();
  });

  it('defers missing note errors to read methods', meta({ fixture: 'flat' }), async ({ remdo }) => {
    remdo.validate(() => {
      const sdk = createLexicalEditorNotes({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note = sdk.note('missing');
      expect(note.attached()).toBe(false);
      expect(() => note.text()).toThrow(NoteNotFoundError);
    });
  });
});
