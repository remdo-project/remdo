import { describe, expect, it } from 'vitest';

import { createDocumentPath, createNoteRef, parseDocumentRef, parseNoteRef } from '@/routing';

describe('routing note refs', () => {
  it('creates and parses root document refs', () => {
    expect(createDocumentPath('main')).toBe('/n/main');
    expect(parseDocumentRef('main')).toEqual({ docId: 'main', noteId: null });
  });

  it('creates and parses zoom document refs', () => {
    expect(createDocumentPath('main', 'note2')).toBe('/n/main_note2');
    expect(parseDocumentRef('main_note2')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('splits note refs at the first separator', () => {
    expect(createNoteRef('main', 'note2')).toBe('main_note2');
    expect(parseNoteRef('main')).toBeNull();
    expect(parseNoteRef('main_note2_extra')).toEqual({ docId: 'main', noteId: 'note2_extra' });
    expect(parseDocumentRef('main_note2_extra')).toEqual({ docId: 'main', noteId: 'note2_extra' });
  });
});
