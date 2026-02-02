import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LEXICAL_UTILS_PATH = path.resolve('data/.vendor/lexical/packages/lexical/src/LexicalUtils.ts');
const LOCAL_COPY_PATH = path.resolve('src/editor/lexical/unexported.ts');

const BEGIN_MARKER = '// BEGIN COPIED:';
const END_MARKER = '// END COPIED:';

const extractBlocks = (source) => {
  const blocks = [];
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

async function main() {
  const [lexicalUtils, localCopy] = await Promise.all([
    fs.readFile(LEXICAL_UTILS_PATH, 'utf8'),
    fs.readFile(LOCAL_COPY_PATH, 'utf8'),
  ]);

  const blocks = extractBlocks(localCopy);
  if (blocks.length === 0) {
    throw new Error('Expected at least one BEGIN/END marker block in unexported.ts.');
  }

  const drifted = [];
  for (const { label, block } of blocks) {
    if (!lexicalUtils.includes(block)) {
      drifted.push(label);
    }
  }

  if (drifted.length > 0) {
    throw new Error(`LexicalUtils drift detected for blocks: ${drifted.join(', ')}.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
