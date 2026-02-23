import { describe, expect, it } from 'vitest';
import { createNoteSdk } from '@/editor/outline/sdk';
import type { NoteSdkAdapter } from '@/editor/outline/sdk';

function createMockAdapterFixture(): { adapter: NoteSdkAdapter; notes: Map<string, { text: string; children: string[] }> } {
  const notes = new Map<string, { text: string; children: string[] }>([
    ['a', { text: 'A', children: ['b', 'c'] }],
    ['b', { text: 'B', children: [] }],
    ['c', { text: 'C', children: [] }],
  ]);
  const current: string | null = 'b';

  return {
    notes,
    adapter: {
      docId: () => 'doc-1',
      adapterSelection: () => ({ kind: 'caret', noteId: current }),
      hasNote: (noteId) => notes.has(noteId),
      textOf: (noteId) => notes.get(noteId)?.text ?? null,
      childrenOf: (noteId) => notes.get(noteId)?.children ?? null,
      indent: (noteId) => notes.has(noteId),
      outdent: (noteId) => noteId !== 'a' && notes.has(noteId),
      moveUp: (noteId) => noteId === 'b',
      moveDown: (noteId) => noteId === 'b',
    },
  };
}

describe('note sdk core', () => {
  it('builds note handles from adapter data', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.get('a');

    expect(note.id()).toBe('a');
    expect(note.text()).toBe('A');
    expect(note.children().map((child) => child.id())).toEqual(['b', 'c']);
  });

  it('reflects selection and throws for missing notes', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);

    expect(sdk.docId()).toBe('doc-1');
    const selection = sdk.selection();
    expect(selection.kind).toBe('caret');
    const caret = selection.as('caret');
    expect(caret.note.id()).toBe('b');
    expect(() => selection.as('structural')).toThrow('Expected structural selection, got caret');
    expect(() => sdk.get('missing')).toThrow('Note not found: missing');
  });

  it('delegates mutating operations to adapter and preserves no-op booleans', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const a = sdk.get('a');
    const b = sdk.get('b');

    expect(a.outdent()).toBe(false);
    expect(b.indent()).toBe(true);
    expect(b.moveUp()).toBe(true);
    expect(b.moveDown()).toBe(true);
  });

  it('throws from handle operations once the note is removed', () => {
    const fixture = createMockAdapterFixture();
    const sdk = createNoteSdk(fixture.adapter);
    const note = sdk.get('b');

    fixture.notes.delete('b');

    expect(() => note.text()).toThrow('Note not found: b');
    expect(() => note.children()).toThrow('Note not found: b');
    expect(() => note.indent()).toThrow('Note not found: b');
    expect(() => note.moveUp()).toThrow('Note not found: b');
  });
});
