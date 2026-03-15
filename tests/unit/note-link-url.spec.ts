import { describe, expect, it } from 'vitest';

import { parseNoteLinkUrl, parseOwnedNoteLinkUrl } from '@/editor/links/note-link-url';

describe('note link URL helpers', () => {
  it('parses same-document URL into fully-qualified reference', () => {
    expect(parseNoteLinkUrl('/n/main_note2', 'main')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('parses cross-document URL into docId plus noteId', () => {
    expect(parseNoteLinkUrl('/n/other_note2', 'main')).toEqual({ docId: 'other', noteId: 'note2' });
  });

  it('parses relative URLs without browser location in node runtime', () => {
    expect(parseNoteLinkUrl('/n/main_note2', 'main')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('canonicalizes note-shaped URLs with query strings or fragments', () => {
    expect(parseNoteLinkUrl('/n/main_note2?foo=1', 'main')).toEqual({ docId: 'main', noteId: 'note2' });
    expect(parseNoteLinkUrl('/n/main_note2#frag', 'main')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('treats same-origin absolute note URLs as owned note links', () => {
    expect(parseOwnedNoteLinkUrl('https://remdo.test/n/main_note2', {
      currentDocId: 'main',
      currentOrigin: 'https://remdo.test',
    })).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('does not treat foreign absolute note-shaped URLs as owned note links', () => {
    expect(parseOwnedNoteLinkUrl('https://example.com/n/main_note2', {
      currentDocId: 'main',
      currentOrigin: 'https://remdo.test',
    })).toBeNull();
  });

  it('treats same-origin protocol-relative note URLs as owned note links', () => {
    expect(parseOwnedNoteLinkUrl('//remdo.test/n/main_note2', {
      currentDocId: 'main',
      currentOrigin: 'https://remdo.test',
    })).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('canonicalizes same-origin note URLs with query strings or fragments as owned note links', () => {
    expect(parseOwnedNoteLinkUrl('https://remdo.test/n/main_note2?foo=1', {
      currentDocId: 'main',
      currentOrigin: 'https://remdo.test',
    })).toEqual({ docId: 'main', noteId: 'note2' });
    expect(parseOwnedNoteLinkUrl('https://remdo.test/n/main_note2#frag', {
      currentDocId: 'main',
      currentOrigin: 'https://remdo.test',
    })).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('does not treat foreign protocol-relative note-shaped URLs as owned note links', () => {
    expect(parseOwnedNoteLinkUrl('//example.com/n/main_note2', {
      currentDocId: 'main',
      currentOrigin: 'https://remdo.test',
    })).toBeNull();
  });
});
