import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { parseInternalNoteLinkUrl } from '@/editor/links/internal-link-url';

function runTsxEval(code: string): string {
  return execFileSync('pnpm', ['exec', 'tsx', '-e', code], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  }).trim();
}

describe('internal link URL helpers', () => {
  it('parses same-document URL into note-only reference', () => {
    expect(parseInternalNoteLinkUrl('/n/main_note2', 'main')).toEqual({ noteId: 'note2' });
  });

  it('parses cross-document URL into docId plus noteId', () => {
    expect(parseInternalNoteLinkUrl('/n/other_note2', 'main')).toEqual({ docId: 'other', noteId: 'note2' });
  });

  it('parses relative URLs without browser location in node runtime', () => {
    const output = runTsxEval(`
      import { parseInternalNoteLinkUrl } from './src/editor/links/internal-link-url.ts';
      console.log(JSON.stringify(parseInternalNoteLinkUrl('/n/main_note2', 'main')));
    `);
    expect(output).toBe('{"noteId":"note2"}');
  });
});
