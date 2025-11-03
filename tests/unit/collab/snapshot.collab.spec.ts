import path from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readOutline } from '#tests';
import { waitFor } from '@testing-library/react';
import { config } from '#config/client';

describe.skipIf(!config.COLLAB_ENABLED)('snapshot CLI', () => {
  const runSnapshotCommand = (...args: string[]) => {
    execFileSync('pnpm', ['run', 'snapshot', ...args], { stdio: 'inherit' });
  };
  const readEditorState = (filePath: string) => JSON.parse(readFileSync(filePath, 'utf8')).editorState;

  it("loads data into collaboration doc and writes it back to disk", () => {
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const savePath = path.resolve('data', 'snapshot.cli.json');
    runSnapshotCommand('load', loadPath);
    runSnapshotCommand('save', savePath);

    expect(readEditorState(savePath)).toEqual(readEditorState(loadPath));
  });

  const extractTextContent = (node: any): string[] => {
    if (!node) return [];
    if (Array.isArray(node)) {
      return node.flatMap(extractTextContent);
    }

    const texts: string[] = [];
    if (typeof node.text === 'string' && node.text.length > 0) {
      texts.push(node.text);
    }

    if (node.children) {
      texts.push(...extractTextContent(node.children));
    }

    return texts;
  };

  const extractOutlineTexts = (outline: Array<{ text: string; children: any[] }>): string[] =>
    outline.flatMap(({ text, children }) => [text, ...extractOutlineTexts(children)]);

  it('saves the current editor state via snapshot CLI', async ({ lexical }) => {
    lexical.load('flat');
    await lexical.waitForCollabSync();

    const savePath = path.resolve('data', 'snapshot.cli.flat.json');
    try {
      const expectedTexts = extractOutlineTexts(readOutline(lexical.validate));
      runSnapshotCommand('save', savePath);
      const saved = readEditorState(savePath);
      const savedTexts = extractTextContent(saved.root);
      expect(savedTexts).toEqual(expectedTexts);
    } finally {
      try {
        unlinkSync(savePath);
      } catch {
        // ignore cleanup failure
      }
    }
  });

  it.skipIf(true)('loads a snapshot fixture into the editor', async ({ lexical }) => {
    const loadPath = path.resolve('tests/fixtures/tree.json');
    runSnapshotCommand('load', loadPath);

    await lexical.waitForCollabSync();

    await waitFor(() => {
      const currentOutline = extractOutlineTexts(readOutline(lexical.validate));
      const expectedOutline = extractTextContent(readEditorState(loadPath).root);
      expect(currentOutline).toEqual(expectedOutline);
    }, { timeout: 5000 });
  });
});
