import { describe, expect, it } from 'vitest';

import {
  createDocumentPath,
  createNoteRef,
  normalizeDocumentId,
  parseDocumentRef,
  parseNoteRef,
  resolveDefaultDocId,
} from '@/routing';

describe('routing note refs', () => {
  it('creates and parses root document refs', () => {
    expect(createDocumentPath('main')).toBe('/n/main');
    expect(parseDocumentRef('main')).toEqual({ docId: 'main', noteId: null });
  });

  it('creates and parses zoom document refs', () => {
    expect(createDocumentPath('main', 'note2')).toBe('/n/main_note2');
    expect(parseDocumentRef('main_note2')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('rejects refs with additional separators or invalid characters', () => {
    expect(createNoteRef('main', 'note2')).toBe('main_note2');
    expect(parseNoteRef('main')).toBeNull();
    expect(parseNoteRef('main_note2_extra')).toBeNull();
    expect(parseDocumentRef('main_note2_extra')).toBeNull();
    expect(parseDocumentRef('bad doc')).toBeNull();
    expect(parseDocumentRef('main_note 2')).toBeNull();
  });

  it('normalizes by trimming and enforces max length', () => {
    expect(normalizeDocumentId('  main  ')).toBe('main');
    expect(normalizeDocumentId('')).toBeNull();
    expect(normalizeDocumentId(' '.repeat(5))).toBeNull();
    expect(normalizeDocumentId('a'.repeat(20))).toBe('a'.repeat(20));
    expect(normalizeDocumentId('a'.repeat(21))).toBeNull();
  });

  it('throws when creating paths from invalid ids', () => {
    expect(() => createDocumentPath('bad doc')).toThrow();
    expect(() => createDocumentPath('main', 'bad note')).toThrow();
    expect(() => createDocumentPath('main', '')).toThrow();
  });

  it('resolves default document id from env input', () => {
    expect(resolveDefaultDocId('')).toBe('main');
    expect(resolveDefaultDocId('   ')).toBe('main');
    expect(resolveDefaultDocId(' main ')).toBe('main');
    expect(resolveDefaultDocId('otherDoc')).toBe('otherDoc');
    expect(() => resolveDefaultDocId('other-doc')).toThrow();
  });
});
