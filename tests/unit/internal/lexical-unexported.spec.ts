import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LEXICAL_UTILS_PATH = path.resolve('data/.vendor/lexical/packages/lexical/src/LexicalUtils.ts');
const LOCAL_COPY_PATH = path.resolve('src/editor/lexical/unexported.ts');

const BEGIN_MARKER = '// BEGIN COPIED:';
const END_MARKER = '// END COPIED:';

const extractBlocks = (source: string): Array<{ label: string; block: string }> => {
  const blocks: Array<{ label: string; block: string }> = [];
  let offset = 0;

  while (offset < source.length) {
    const beginIndex = source.indexOf(BEGIN_MARKER, offset);
    if (beginIndex === -1) {
      break;
    }

    const labelStart = beginIndex + BEGIN_MARKER.length;
    const labelLineEnd = source.indexOf('\n', labelStart);
    if (labelLineEnd === -1) {
      throw new Error('Expected newline after BEGIN marker.');
    }

    const label = source.slice(labelStart, labelLineEnd).trim();
    if (!label) {
      throw new Error('Expected label after BEGIN marker.');
    }

    const endMarker = `${END_MARKER} ${label}`;
    const endIndex = source.indexOf(endMarker, labelLineEnd + 1);
    if (endIndex === -1) {
      throw new Error(`Expected END marker for ${label}.`);
    }

    const blockStart = labelLineEnd + 1;
    const block = source.slice(blockStart, endIndex);
    blocks.push({ label, block });

    offset = endIndex + endMarker.length;
  }

  return blocks;
};

describe('lexical unexported helpers', () => {
  it('matches the vendored LexicalUtils implementations', async () => {
    const [lexicalUtils, localCopy] = await Promise.all([
      fs.readFile(LEXICAL_UTILS_PATH, 'utf8'),
      fs.readFile(LOCAL_COPY_PATH, 'utf8'),
    ]);

    const blocks = extractBlocks(localCopy);
    expect(blocks.length).toBeGreaterThan(0);

    for (const { label, block } of blocks) {
      const found = lexicalUtils.includes(block);
      expect(found, `${label} block drifted from LexicalUtils`).toBe(true);
    }
  });
});
