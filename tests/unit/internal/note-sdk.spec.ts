import { describe, expect, it } from 'vitest';
import { meta, placeCaretAtNote, selectNoteRange } from '#tests';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
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
    const caret = selection.as('caret');
    expect(caret.heads().map((head) => head.id())).toEqual(['note3']);
  });

  it('resolves structural selection heads', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await selectNoteRange(remdo, 'note2', 'note3');

    const selection = remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.selection();
    });

    expect(selection.kind).toBe('structural');
    const structural = selection.as('structural');
    expect(structural.heads().map((head) => head.id())).toEqual(['note2', 'note3']);
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
          return sdk
            .selection()
            .as('structural')
            .heads()
            .map((head) => head.id());
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
          return sdk
            .selection()
            .as('structural')
            .heads()
            .map((head) => head.id());
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
        indentOne: note.indent(),
        indentTwo: note.indent(),
        outdentOne: note.outdent(),
        outdentTwo: note.outdent(),
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
      expect(handle.id()).toBe('note2');
      expect(() => handle.text()).toThrow('Note not found: note2');
      expect(() => handle.children()).toThrow('Note not found: note2');
      expect(() => handle.indent()).toThrow('Note not found: note2');
      expect(() => handle.moveUp()).toThrow('Note not found: note2');
    });
  });

  it('throws when used outside lexical read/update context', meta({ fixture: 'flat' }), async ({ remdo }) => {
    const note = remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      return sdk.get('note2');
    });

    expect(() => note.text()).toThrow();
    expect(() => note.indent()).toThrow();
  });

  it('throws when get() targets a missing note', meta({ fixture: 'flat' }), async ({ remdo }) => {
    remdo.validate(() => {
      const sdk = createLexicalNoteSdk({ editor: remdo.editor, docId: remdo.getCollabDocId() });
      expect(() => sdk.get('missing')).toThrow('Note not found: missing');
    });
  });
});
