import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { createInternalNoteLinkUrl, parseInternalNoteLinkUrl } from '@/editor/links/internal-link-url';

function runTsxEval(code: string): string {
  return execFileSync('pnpm', ['exec', 'tsx', '-e', code], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  }).trim();
}

describe('internal link URL helpers', () => {
  it('uses current document id when link docId is omitted', () => {
    expect(createInternalNoteLinkUrl({ noteId: 'note2' }, 'main')).toBe('/n/main_note2');
  });

  it('keeps explicit document id when creating URLs', () => {
    expect(createInternalNoteLinkUrl({ docId: 'other', noteId: 'note2' }, 'main')).toBe('/n/other_note2');
  });

  it('parses same-document URL into note-only reference', () => {
    expect(parseInternalNoteLinkUrl('/n/main_note2', 'main')).toEqual({ noteId: 'note2' });
  });

  it('parses cross-document URL into docId plus noteId', () => {
    expect(parseInternalNoteLinkUrl('/n/other_note2', 'main')).toEqual({ docId: 'other', noteId: 'note2' });
  });

  it('creates URLs in node runtime without browser location', () => {
    const output = runTsxEval(`
      import { createInternalNoteLinkUrl } from './src/editor/links/internal-link-url.ts';
      console.log(createInternalNoteLinkUrl({ noteId: 'note2' }, 'main'));
    `);
    expect(output).toBe('/n/main_note2');
  });

  it('parses relative URLs without browser location in node runtime', () => {
    const output = runTsxEval(`
      import { parseInternalNoteLinkUrl } from './src/editor/links/internal-link-url.ts';
      console.log(JSON.stringify(parseInternalNoteLinkUrl('/n/main_note2', 'main')));
    `);
    expect(output).toBe('{"noteId":"note2"}');
  });
});
