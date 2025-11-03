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

  it('loads data into collaboration doc and writes it back to disk', async () => {
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const savePath = path.resolve('data', 'snapshot.cli.json');
    runSnapshotCommand('load', loadPath);

    try {
      await waitFor(() => {
        runSnapshotCommand('save', savePath);
        const saved = readEditorState(savePath);
        return JSON.stringify(saved) === JSON.stringify(readEditorState(loadPath));
      }, { timeout: 5000 });
    } finally {
      try {
        unlinkSync(savePath);
      } catch {}
    }
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
      await waitFor(() => {
        runSnapshotCommand('save', savePath);
        const savedTexts = extractTextContent(readEditorState(savePath).root);
        return JSON.stringify(savedTexts) === JSON.stringify(expectedTexts);
      }, { timeout: 5000 });
    } finally {
      try {
        unlinkSync(savePath);
      } catch {
        // ignore cleanup failure
      }
    }
  });

  it('loads a snapshot fixture into the editor', { timeout: 5000 }, async ({ lexical }) => {
    const loadPath = path.resolve('tests/fixtures/tree.json');
    runSnapshotCommand('load', loadPath);

    await lexical.waitForCollabSync();

    const expectedOutline = extractTextContent(readEditorState(loadPath).root);
    const savePath = path.resolve('data', 'snapshot.cli.tree.json');
    let finalSaved: string[] | null = null;

    try {
      await waitFor(() => {
        runSnapshotCommand('save', savePath);
        const savedOutline = extractTextContent(readEditorState(savePath).root);
        finalSaved = savedOutline;
        return JSON.stringify(savedOutline) === JSON.stringify(expectedOutline);
      }, { timeout: 5000 });
    } finally {
      try {
        unlinkSync(savePath);
      } catch {
        // ignore cleanup failure
      }
    }

    expect(finalSaved).not.toBeNull();
    expect(finalSaved).toEqual(expectedOutline);

    await lexical.waitForCollabSync();
    expect(lexical.hasCollabUnsyncedChanges()).toBe(false);
  });
});
