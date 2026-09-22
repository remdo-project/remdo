import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list';
import { $createTextNode, $getRoot, $setState, createEditor } from 'lexical';
import { describe, expect, it } from 'vitest';
import { getNoteKey, meta } from '#tests';
import { $addNoteBody } from '#client/editor/features/note-body/note-body-ops';
import { SET_NOTE_CHECKED_COMMAND, SET_NOTE_FOLD_COMMAND } from '#client/editor/foundation/commands';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { collectLexicalDocumentSearchResults } from './lexical-document-search';

const ALL = { query: '', limit: 10, childPreviewLimit: 2 };

describe('lexical document search', () => {
  it('returns notes and complete ancestor paths in document order', meta({ fixture: 'tree-complex' }), ({ remdo }) => {
    const { flatResults, hasMore } = collectLexicalDocumentSearchResults(remdo.editor, ALL);

    expect(hasMore).toBe(false);
    expect(flatResults.map(({ note }) => note.id))
      .toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7']);
    expect(flatResults.map(({ path }) => path.map(({ id }) => id))).toEqual([
      ['note1'],
      ['note1', 'note2'],
      ['note1', 'note2', 'note3'],
      ['note1', 'note4'],
      ['note5'],
      ['note6'],
      ['note6', 'note7'],
    ]);
  });

  it('bounds direct-child previews while retaining their exact count', meta({ fixture: 'tree-complex' }), ({ remdo }) => {
    const { flatResults } = collectLexicalDocumentSearchResults(remdo.editor, {
      ...ALL, childPreviewLimit: 1,
    });

    expect(flatResults[0]!.childPreview).toMatchObject({
      notes: [{ id: 'note2', text: 'note2', checked: false }],
      listType: 'bullet',
      totalCount: 2,
    });
    expect(flatResults[1]!.childPreview).toMatchObject({
      notes: [{ id: 'note3', text: 'note3', checked: false }],
      totalCount: 1,
    });
    expect(flatResults[2]!.childPreview).toEqual({ notes: [], listType: 'bullet', totalCount: 0 });
  });

  it('keeps checked values, parent list types, and descendants of folded notes',
    meta({ fixture: 'tree-list-types' }), async ({ remdo }) => {
      await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, {
        state: 'checked', noteItemKey: getNoteKey(remdo, 'note4'),
      });
      await remdo.dispatchCommand(SET_NOTE_CHECKED_COMMAND, {
        state: 'checked', noteItemKey: getNoteKey(remdo, 'note6'),
      });
      await remdo.dispatchCommand(SET_NOTE_FOLD_COMMAND, {
        state: 'folded', noteItemKey: getNoteKey(remdo, 'note3'),
      });

      const { flatResults } = collectLexicalDocumentSearchResults(remdo.editor, ALL);

      expect(flatResults.map(({ note }) => note.id))
        .toEqual(['note1', 'note2', 'note3', 'note4', 'note5', 'note6']);
      expect(flatResults[0]!.childPreview).toMatchObject({
        notes: [{ id: 'note2', checked: false }],
        listType: 'number',
      });
      expect(flatResults[2]).toMatchObject({
        note: { id: 'note3', folded: true, checked: false },
        childPreview: {
          notes: [{ id: 'note4', text: 'note4', checked: true }],
          listType: 'check',
        },
      });
      expect(flatResults[3]!.path.map(({ id }) => id)).toEqual(['note3', 'note4']);
      expect(flatResults[4]!.childPreview).toMatchObject({
        notes: [{ id: 'note6', checked: true }],
        listType: 'bullet',
      });
    });

  it('keeps a body out of the note list while matching its text', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.mutate(() => {
      $addNoteBody($findNoteById('note1')!).append($createTextNode('body-only-token'));
    });

    const { flatResults } = collectLexicalDocumentSearchResults(remdo.editor, ALL);

    // A body is not a note: it never appears as its own result or child, and it
    // never becomes part of a note's label.
    expect(flatResults.map(({ note }) => ({ id: note.id, text: note.text }))).toEqual([
      { id: 'note1', text: 'note1' },
      { id: 'note2', text: 'note2' },
      { id: 'note3', text: 'note3' },
    ]);
    expect(flatResults[0]!.childPreview.notes.map(({ id }) => id)).toEqual(['note2']);

    // Body text is still findable — it is where a note's detail lives.
    const matched = collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'body-only-token' });
    expect(matched.flatResults.map(({ note }) => note.id)).toEqual(['note1']);
    expect(matched.flatResults[0]!.note.body).toBe('body-only-token');
  });

  it('exposes a null body for a note that has none', meta({ fixture: 'flat' }), ({ remdo }) => {
    const { flatResults } = collectLexicalDocumentSearchResults(remdo.editor, ALL);
    expect(flatResults.every(({ note }) => note.body === null)).toBe(true);
  });

  it('does not let an ancestor body satisfy the leaf-first guard', meta({ fixture: 'basic' }), async ({ remdo }) => {
    // note1's body holds the token; note2 is its child. A body belongs to its
    // own note, so it must not pull the whole subtree into the results the way
    // an ancestor label legitimately can.
    await remdo.mutate(() => {
      $addNoteBody($findNoteById('note1')!).append($createTextNode('ancestoronly'));
    });

    expect(collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'ancestoronly' })
      .flatResults.map(({ note }) => note.id)).toEqual(['note1']);
  });

  it('matches one token on a body and another on an ancestor label', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.updateNoteText('note1', 'Work');
    await remdo.mutate(() => {
      $addNoteBody($findNoteById('note2')!).append($createTextNode('quarterly review'));
    });

    // Path scoping is unchanged: 'work' comes from the ancestor label, while
    // 'quarterly' satisfies the leaf-first guard from note2's own body.
    expect(collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'work quarterly' })
      .flatResults.map(({ note }) => note.id)).toEqual(['note2']);
  });

  it('requires an own-text token and matches other tokens against ancestors', meta({ fixture: 'basic' }), async ({ remdo }) => {
    await remdo.updateNoteText('note1', 'Work');
    await remdo.updateNoteText('note2', 'Roadmap');
    await remdo.updateNoteText('note3', 'Work roadworks');

    expect(collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'work' })
      .flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note3']);
    const results = collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: '  ROAD\twork ' });
    expect(results.flatResults.map(({ note }) => note.id)).toEqual(['note2', 'note3']);
    expect(results.flatResults[0]!.path.map(({ text }) => text)).toEqual(['Work', 'Roadmap']);
    expect(results.hasMore).toBe(false);
  });

  it('reports more matches only when an additional match exists', meta({ fixture: 'flat' }), ({ remdo }) => {
    const capped = collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, limit: 2 });
    expect(capped.flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note2']);
    expect(capped.hasMore).toBe(true);

    const exact = collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, limit: 3 });
    expect(exact.flatResults.map(({ note }) => note.id)).toEqual(['note1', 'note2', 'note3']);
    expect(exact.hasMore).toBe(false);
  });

  it('reads committed edits on the next request without mutating retained values', meta({ fixture: 'basic' }), async ({ remdo }) => {
    const previous = collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'note2' });
    const parent = previous.flatResults[0]!.path[0]!;

    await remdo.updateNoteText('note1', 'renamed parent');
    await remdo.updateNoteText('note2', 'changed');

    expect(collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'note2' }))
      .toEqual({ flatResults: [], hasMore: false });
    const current = collectLexicalDocumentSearchResults(remdo.editor, { ...ALL, query: 'changed' });
    expect(current.flatResults[0]!.path.map(({ text }) => text)).toEqual(['renamed parent', 'changed']);
    expect(previous.flatResults[0]!.path.map(({ text }) => text)).toEqual(['note1', 'note2']);
    expect(() => Object.assign(parent, { text: 'consumer mutation' })).toThrow(TypeError);
    expect(() => Object.assign(parent.children!.noteIds, { 0: 'other' })).toThrow(TypeError);
  });

  it('searches a deep branch and returns its full path', () => {
    const editor = createEditor({
      namespace: 'deep-document-search',
      nodes: [ListNode, ListItemNode],
      onError: (error) => { throw error; },
    });
    const depth = 128;
    editor.update(() => {
      let list = $createListNode('bullet');
      $getRoot().append(list);
      for (let index = 0; index < depth; index += 1) {
        const note = $createListItemNode();
        $setState(note, noteIdState, `deep${index}`);
        note.append($createTextNode(index === depth - 1 ? 'target' : 'ancestor'));
        list.append(note);
        if (index < depth - 1) {
          const nested = $createListNode('bullet');
          list.append($createListItemNode().append(nested));
          list = nested;
        }
      }
    }, { discrete: true });

    const { flatResults, hasMore } = collectLexicalDocumentSearchResults(editor, { ...ALL, query: 'target' });

    expect(hasMore).toBe(false);
    expect(flatResults).toHaveLength(1);
    expect(flatResults[0]!.note).toMatchObject({ id: 'deep127', text: 'target', children: null });
    expect(flatResults[0]!.path.map(({ id }) => id))
      .toEqual(Array.from({ length: depth }, (_unused, index) => `deep${index}`));
  });
});
