import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { parseNoteLinkUrl } from '@/editor/links/note-link-url';

function runTsxEval(code: string): string {
  return execFileSync('pnpm', ['exec', 'tsx', '-e', code], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  }).trim();
}

describe('note link URL helpers', () => {
  it('parses same-document URL into fully-qualified reference', () => {
    expect(parseNoteLinkUrl('/n/main_note2', 'main')).toEqual({ docId: 'main', noteId: 'note2' });
  });

  it('parses cross-document URL into docId plus noteId', () => {
    expect(parseNoteLinkUrl('/n/other_note2', 'main')).toEqual({ docId: 'other', noteId: 'note2' });
  });

  it('parses relative URLs without browser location in node runtime', () => {
    const output = runTsxEval(`
      import { parseNoteLinkUrl } from './src/editor/links/note-link-url.ts';
      console.log(JSON.stringify(parseNoteLinkUrl('/n/main_note2', 'main')));
    `);
    expect(output).toBe('{"docId":"main","noteId":"note2"}');
  });
});
