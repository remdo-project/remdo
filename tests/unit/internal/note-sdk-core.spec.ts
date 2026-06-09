import { describe, expect, it, vi } from 'vitest';
import { createEditorNotes, createUserDataRootNote, NoteNotFoundError } from '#note-sdk';
import type {
  EditorNotesAdapter,
  NoteRange,
  PlaceTarget,
  SelectionSnapshot,
} from '#note-sdk';
import type { SourceServer } from '#domain/source-servers';

function createMockAdapterFixture(
  adapterSelection?: SelectionSnapshot
): {
  adapter: EditorNotesAdapter;
  userData: Parameters<typeof createUserDataRootNote>[0];
  sourceServers: SourceServer[];
  notes: Map<string, { text: string; children: string[] }>;
  placeCalls: Array<{ range: NoteRange; target: PlaceTarget }>;
} {
  const resolvedSelection = adapterSelection ?? { kind: 'caret', range: { start: 'b', end: 'b' } };
  const notes = new Map<string, { text: string; children: string[] }>([
    ['a', { text: 'A', children: ['b', 'c'] }],
    ['b', { text: 'B', children: [] }],
    ['c', { text: 'C', children: [] }],
  ]);
  const placeCalls: Array<{ range: NoteRange; target: PlaceTarget }> = [];
  let nextDraftId = 1;
  const userData = [
    {
      id: 'main',
      title: 'Main',
      access: [{
        documentId: 'main',
        email: 'bob@example.test',
        granteeUserId: 'bob',
        name: 'Bob',
      }],
    },
    { id: 'flat', title: 'Flat' },
  ];
  const sourceServers = [
    {
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
      linked: false,
    },
  ];

  const requireNote = (noteId: string): { text: string; children: string[] } => {
    const note = notes.get(noteId);
    if (!note) {
      throw new NoteNotFoundError(noteId);
    }
    return note;
  };

  const requireRange = (range: NoteRange): void => {
    requireNote(range.start);
    requireNote(range.end);
  };

  return {
    notes,
    placeCalls,
    userData,
    sourceServers,
    adapter: {
      docId: () => 'doc-1',
      currentDocumentChildrenIds: () => ['a'],
      selection: () => resolvedSelection,
      createNote: (target, text = '') => {
        if ('parent' in target) {
          if (target.parent !== 'doc-1') {
            requireNote(target.parent);
          }
        } else if ('before' in target) {
          requireNote(target.before);
        } else {
          requireNote(target.after);
        }

        const noteId = `draft-${nextDraftId}`;
        nextDraftId += 1;
        notes.set(noteId, { text, children: [] });
        placeCalls.push({ range: { start: noteId, end: noteId }, target });
        return noteId;
      },
      hasNote: (noteId) => notes.has(noteId),
      isBounded: (noteId) => notes.has(noteId),
      textOf: (noteId) => requireNote(noteId).text,
      childrenOf: (noteId) => requireNote(noteId).children,
      delete: (range) => {
        requireRange(range);
        notes.delete(range.start);
        notes.delete(range.end);
        return true;
      },
      place: (range, target) => {
        requireRange(range);
        if ('parent' in target) {
          if (target.parent !== 'doc-1') {
            requireNote(target.parent);
          }
        } else if ('before' in target) {
          requireNote(target.before);
        } else {
          requireNote(target.after);
        }
        placeCalls.push({ range, target });
      },
      indent: (range) => {
        requireRange(range);
        return true;
      },
      outdent: (range) => {
        requireRange(range);
        return range.start !== 'a' || range.end !== 'a';
      },
      moveUp: (range) => {
        requireRange(range);
        return range.start === 'b' && range.end === 'b';
      },
      moveDown: (range) => {
        requireRange(range);
        return range.start === 'b' && range.end === 'b';
      },
    },
  };
}

describe('editor notes core', () => {
  it('narrows notes by kind and throws on mismatches', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);
    const documents = createUserDataRootNote(fixture.userData).documents();
    const note = sdk.note('a');

    expect(documents.kind()).toBe('collection');
    expect(documents.children()[0]!.text()).toBe('Main');
    expect(note.as('editor-note').attached()).toBe(true);
    expect(() => note.as('document')).toThrow('expected "document"');
  });

  it('lists documents through user-data documents collection traversal', () => {
    const fixture = createMockAdapterFixture();
    const documents = createUserDataRootNote(fixture.userData).documents();

    expect(documents.byId('flat')?.text()).toBe('Flat');
    expect(
      documents.children().map((document) => ({
        id: document.id(),
        kind: document.kind(),
        text: document.text(),
      }))
    ).toEqual([
      { id: 'main', kind: 'document', text: 'Main' },
      { id: 'flat', kind: 'document', text: 'Flat' },
    ]);
  });

  it('shares documents through document-level user-data handles', async () => {
    const fixture = createMockAdapterFixture();
    const shareDocument = vi.fn(async (documentId: string, email: string) => ({
      documentId,
      email,
      granteeUserId: 'carol',
      name: 'Carol',
    }));
    const documents = createUserDataRootNote(fixture.userData, {
      shareDocument,
    }).documents();
    const document = documents.byId('main')!;

    expect(document.access().children().map((access) => ({
      id: access.id(),
      kind: access.kind(),
      text: access.text(),
      email: access.email(),
      granteeUserId: access.granteeUserId(),
      name: access.name(),
    }))).toEqual([{
      id: 'bob',
      kind: 'document-access',
      text: 'Bob',
      email: 'bob@example.test',
      granteeUserId: 'bob',
      name: 'Bob',
    }]);

    const access = await document.shareWith('carol@example.test');

    expect(shareDocument).toHaveBeenCalledWith('main', 'carol@example.test');
    expect(access.text()).toBe('Carol');
  });

  it('lists source servers through user-data source-server traversal', async () => {
    const fixture = createMockAdapterFixture();
    const linkSourceServer = vi.fn<() => Promise<void>>().mockResolvedValue();
    const sourceServers = createUserDataRootNote(fixture.userData, fixture.sourceServers, {
      linkSourceServer,
    }).sourceServers();

    const sourceServer = sourceServers.byId('source')!;

    expect(sourceServers.kind()).toBe('collection');
    expect(sourceServers.children().map((server) => ({
      id: server.id(),
      kind: server.kind(),
      text: server.text(),
      baseUrl: server.baseUrl(),
      linked: server.linked(),
    }))).toEqual([{
      id: 'source',
      kind: 'source-server',
      text: 'Source Server',
      baseUrl: 'https://source.example',
      linked: false,
    }]);
    expect(sourceServer.as('source-server')).toBe(sourceServer);

    await sourceServer.link();

    expect(linkSourceServer).toHaveBeenCalledWith('source');
  });

  it('reads note data from adapter', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);
    const note = sdk.note('a');

    expect(note.id()).toBe('a');
    expect(note.attached()).toBe(true);
    expect(note.text()).toBe('A');
    expect(note.children().map((child) => child.id())).toEqual(['b', 'c']);
  });

  it('reads current document from adapter', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);
    const document = sdk.currentDocument();

    expect(document.id()).toBe('doc-1');
    expect(document.kind()).toBe('document');
    expect(document.text()).toBe('doc-1');
    expect(document.children().map((note) => note.id())).toEqual(['a']);
  });

  it('reflects selection and defers missing note errors to reads', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);

    expect(sdk.docId()).toBe('doc-1');
    const selection = sdk.selection();
    if (selection.kind !== 'caret') {
      throw new Error(`Expected caret selection, got ${selection.kind}`);
    }
    expect(selection.range.start).toBe('b');
    expect(selection.range.end).toBe('b');
    expect(sdk.indent(selection.range)).toBe(true);
    const missing = sdk.note('missing');
    expect(missing.attached()).toBe(false);
    expect(() => missing.text()).toThrow(NoteNotFoundError);
  });

  it('delegates mutating operations to adapter and preserves no-op booleans', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);

    expect(sdk.outdent({ start: 'a', end: 'a' })).toBe(false);
    expect(sdk.indent({ start: 'b', end: 'b' })).toBe(true);
    expect(sdk.moveUp({ start: 'b', end: 'b' })).toBe(true);
    expect(sdk.moveDown({ start: 'b', end: 'b' })).toBe(true);
  });

  it('creates notes through parent-owned create()', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);

    const placed = sdk.note('a').create({ before: 'b' }, 'Draft');
    const rootPlaced = sdk.currentDocument().create({ index: 0 }, 'Root draft');

    expect(placed.id()).toBe('draft-1');
    expect(placed.text()).toBe('Draft');
    expect(rootPlaced.id()).toBe('draft-2');
    expect(rootPlaced.text()).toBe('Root draft');
    expect(fixture.placeCalls).toEqual([
      { range: { start: 'draft-1', end: 'draft-1' }, target: { before: 'b' } },
      { range: { start: 'draft-2', end: 'draft-2' }, target: { parent: 'doc-1', index: 0 } },
    ]);
  });

  it('delegates place targets in note-id form', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);

    expect(() => sdk.place({ start: 'c', end: 'c' }, { before: 'b' })).not.toThrow();
    expect(() => sdk.place({ start: 'c', end: 'c' }, { after: 'b' })).not.toThrow();
    expect(() => sdk.place({ start: 'c', end: 'c' }, { parent: 'a', index: -1 })).not.toThrow();

    expect(fixture.placeCalls).toEqual([
      { range: { start: 'c', end: 'c' }, target: { before: 'b' } },
      { range: { start: 'c', end: 'c' }, target: { after: 'b' } },
      { range: { start: 'c', end: 'c' }, target: { parent: 'a', index: -1 } },
    ]);
  });

  it('throws from reads and operations once the note is removed', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createEditorNotes(fixture.adapter);
    const note = sdk.note('b');

    expect(sdk.delete({ start: 'b', end: 'b' })).toBe(true);

    expect(note.attached()).toBe(false);
    expect(() => note.text()).toThrow(NoteNotFoundError);
    expect(() => note.children()).toThrow(NoteNotFoundError);
    expect(() => sdk.indent({ start: 'b', end: 'b' })).toThrow(NoteNotFoundError);
    expect(() => sdk.moveUp({ start: 'b', end: 'b' })).toThrow(NoteNotFoundError);
  });

  it('uses structural selection range for sdk operations', () => {
    const fixture = createMockAdapterFixture({ kind: 'structural', range: { start: 'b', end: 'b' } });
    const sdk = createEditorNotes(fixture.adapter);
    const selection = sdk.selection();
    if (selection.kind !== 'structural') {
      throw new Error(`Expected structural selection, got ${selection.kind}`);
    }

    expect(sdk.moveDown(selection.range)).toBe(true);
  });
});
