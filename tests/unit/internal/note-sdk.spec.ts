import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote, readOutline, selectNoteRange } from '#tests';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import { NoteNotFoundError } from '@/editor/outline/sdk';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { removeNoteSubtree } from '@/editor/outline/selection/tree';

describe('note sdk', () => {
  it('resolves note reads and document context', meta({ fixture: 'tree' }), async ({ remdo }) => {
    const result = remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note = sdk.get('note2');

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
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.selection();
    });

    expect(selection.kind).toBe('caret');
    expect(selection.heads.map((head) => head.id())).toEqual(['note3']);
  });

  it('resolves structural selection heads', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note3');

    const selection = remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.selection();
    });

    expect(selection.kind).toBe('structural');
    expect(selection.heads.map((head) => head.id())).toEqual(['note2', 'note3']);
  });

  it(
    'falls back to structural selection heads when outline selection store is unavailable',
    meta({ fixture: 'flat' }),
    async ({ remdo }) => {
      await selectNoteRange(remdo, 'note2', 'note3');

      const originalGet = remdo.editor.selection.get;
      remdo.editor.selection.get = () => null;

      try {
        const result = remdo.validate(() => {
          const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
          const selection = sdk.selection();
          expect(selection.kind).toBe('structural');
          return selection.heads.map((head) => head.id());
        });

        expect(result).toEqual(['note2', 'note3']);
      } finally {
        remdo.editor.selection.get = originalGet;
      }
    }
  );

  it(
    'falls back to structural selection for parent-to-descendant range with a single head',
    meta({ fixture: 'tree-complex' }),
    async ({ remdo }) => {
      await selectNoteRange(remdo, 'note2', 'note3');

      const originalGet = remdo.editor.selection.get;
      remdo.editor.selection.get = () => null;

      try {
        const result = remdo.validate(() => {
          const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
          const selection = sdk.selection();
          expect(selection.kind).toBe('structural');
          return selection.heads.map((head) => head.id());
        });

        expect(result).toEqual(['note2']);
      } finally {
        remdo.editor.selection.get = originalGet;
      }
    }
  );

  it('returns false for domain no-ops while preserving valid moves', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let outcomes: { indentOne: boolean; indentTwo: boolean; outdentOne: boolean; outdentTwo: boolean } | null = null;

    await remdo.mutate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note = sdk.get('note2');
      outcomes = {
        indentOne: sdk.indent([note]),
        indentTwo: sdk.indent([note]),
        outdentOne: sdk.outdent([note]),
        outdentTwo: sdk.outdent([note]),
      };
    });

    expect(outcomes).toEqual({
      indentOne: true,
      indentTwo: false,
      outdentOne: true,
      outdentTwo: false,
    });
  });

  it('moves notes before and after targets while preserving caller order', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let moved: { before: boolean; after: boolean } | null = null;

    await remdo.mutate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note1 = sdk.get('note1');
      const note2 = sdk.get('note2');
      const note3 = sdk.get('note3');

      moved = {
        before: sdk.move([note3, note1], { before: note2 }),
        after: sdk.move([note1], { after: note2 }),
      };
    });

    expect(moved).toEqual({ before: true, after: true });
    expect(remdo).toMatchOutline([
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note1', text: 'note1' },
    ]);
  });

  it('moves notes into parent by index with negative and clamped indexing', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    let outcomes: { intoFromEnd: boolean; intoClamp: boolean } | null = null;

    await remdo.mutate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note1 = sdk.get('note1');
      const note5 = sdk.get('note5');
      const note6 = sdk.get('note6');

      outcomes = {
        intoFromEnd: sdk.move([note5], { parent: note1, index: -2 }),
        intoClamp: sdk.move([note6], { parent: note1, index: 999 }),
      };
    });

    expect(outcomes).toEqual({ intoFromEnd: true, intoClamp: true });
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

  it('returns false for move targets that reference moved heads directly', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let result:
      | {
          beforeSelf: boolean;
          afterSelf: boolean;
          beforeOther: boolean;
        }
      | null = null;

    remdo.editor.update(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note2 = sdk.get('note2');
      const note3 = sdk.get('note3');

      result = {
        beforeSelf: sdk.move([note2], { before: note2 }),
        afterSelf: sdk.move([note2], { after: note2 }),
        beforeOther: sdk.move([note2], { before: note3 }),
      };
    });

    expect(result).toEqual({
      beforeSelf: false,
      afterSelf: false,
      beforeOther: false,
    });
    expect(readOutline(remdo).map((node) => node.noteId)).toEqual(['note1', 'note2', 'note3']);
  });

  it('throws when move target no longer exists', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let errorMessage = '';

    remdo.editor.update(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const source = sdk.get('note3');
      const target = sdk.get('note2');
      removeNoteSubtree($findNoteById('note2')!);

      try {
        sdk.move([source], { before: target });
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    });

    expect(errorMessage).toBe('Note not found: note2');
  });

  it('throws for illegal ancestry and invalid move input heads', meta({ fixture: 'tree' }), async ({ remdo }) => {
    let outcomes: { descendant: string; duplicate: string; overlap: string } | null = null;

    remdo.editor.update(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      const note2 = sdk.get('note2');
      const note3 = sdk.get('note3');

      const captureError = (run: () => unknown): string => {
        try {
          run();
          return 'no-throw';
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      };

      outcomes = {
        descendant: captureError(() => sdk.move([note2], { before: note3 })),
        duplicate: captureError(() => sdk.move([note2, note2], { after: note3 })),
        overlap: captureError(() => sdk.move([note2, note3], { after: note2 })),
      };
    });

    expect(outcomes).toEqual({
      descendant: 'Cannot move notes relative to their own descendants',
      duplicate: 'move() expects unique note heads',
      overlap: 'move() expects head notes only (no ancestor/descendant overlap)',
    });
  });

  it('keeps handles stable by noteId and throws once deleted', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const handle = remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.get('note2');
    });

    await remdo.mutate(() => {
      const node = $findNoteById('note2')!;
      removeNoteSubtree(node);
    });

    remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      expect(handle.id()).toBe('note2');
      expect(() => handle.text()).toThrowError(NoteNotFoundError);
      expect(() => handle.children()).toThrowError(NoteNotFoundError);
      expect(() => sdk.indent([handle])).toThrowError(NoteNotFoundError);
      expect(() => sdk.moveUp([handle])).toThrowError(NoteNotFoundError);
    });
  });

  it('throws when used outside lexical read/update context', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const sdkAndNote = remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return { sdk, note: sdk.get('note2') };
    });

    expect(() => sdkAndNote.note.text()).toThrow();
    expect(() => sdkAndNote.sdk.indent([sdkAndNote.note])).toThrow();
  });

  it('throws when get() targets a missing note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      expect(() => sdk.get('missing')).toThrowError(NoteNotFoundError);
    });
  });
});
