import { describe, expect, it } from 'vitest';

import {
  createDocumentPath,
  createDocumentSyncTokenApiPath,
  createSourceDocumentSyncTokenApiPath,
  createNoteRef,
  parseDocumentRef,
  parseNoteRef,
  resolveDevDocumentId,
} from '#document-routes';
import { normalizeDocumentId } from '#domain/documents/ids';

describe('document route refs', () => {
  it('creates and parses root document refs', () => {
    expect(createDocumentPath('main')).toBe('/n/main');
    expect(createDocumentSyncTokenApiPath('main')).toBe('/api/documents/main/sync-tokens');
    expect(parseDocumentRef('main')).toEqual({ docId: 'main', noteId: null });
  });

  it('creates and parses zoom document refs', () => {
    expect(createDocumentPath('main', 'note2')).toBe('/n/main_note2');
    expect(parseDocumentRef('main_note2')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('keeps source ids out of browser document refs', () => {
    expect(createDocumentPath('main')).toBe('/n/main');
    expect(createDocumentPath('main', 'note2')).toBe('/n/main_note2');
    expect(createSourceDocumentSyncTokenApiPath('source-server', 'main'))
      .toBe('/api/current-user/source-servers/source-server/documents/main/sync-tokens');
  });

  it('rejects refs with additional separators or invalid characters', () => {
    expect(createNoteRef('main', 'note2')).toBe('main_note2');
    expect(parseNoteRef('main')).toBeNull();
    expect(parseNoteRef('main_note2_extra')).toBeNull();
    expect(parseDocumentRef('main_note2_extra')).toBeNull();
    expect(parseDocumentRef('source~main')).toBeNull();
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
    expect(() => createDocumentSyncTokenApiPath('bad doc')).toThrow();
    expect(() => createSourceDocumentSyncTokenApiPath('bad source', 'main')).toThrow();
    expect(() => createSourceDocumentSyncTokenApiPath('local', 'main')).toThrow();
    expect(() => createDocumentPath('main', 'bad note')).toThrow();
    expect(() => createDocumentPath('main', '')).toThrow();
  });

  it('resolves dev document id from env input', () => {
    expect(resolveDevDocumentId('')).toBe('devDoc');
    expect(resolveDevDocumentId('   ')).toBe('devDoc');
    expect(resolveDevDocumentId(' main ')).toBe('main');
    expect(resolveDevDocumentId('otherDoc')).toBe('otherDoc');
    expect(() => resolveDevDocumentId('other-doc')).toThrow();
  });
});
