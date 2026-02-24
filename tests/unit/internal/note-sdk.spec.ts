import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote, selectNoteRange } from '#tests';
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
