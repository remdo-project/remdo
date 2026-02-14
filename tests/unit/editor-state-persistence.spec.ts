import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';

import { prepareEditorStateForPersistence, prepareEditorStateForRuntime } from '#lib/editor/editor-state-persistence';
import { collectSerializedNodes, getSerializedRootNodes } from '#tests';

function collectNoteLinkNodes(state: SerializedEditorState): Array<Record<string, unknown>> {
  return collectSerializedNodes(
    getSerializedRootNodes(state),
    (node): node is SerializedLexicalNode & Record<string, unknown> => node.type === 'note-link',
  );
}

describe('editor state persistence', () => {
  it('rehydrates runtime link identity and compacts back to persisted shape', async () => {
    const fixturePath = path.resolve('tests/fixtures/links.json');
    const persisted = JSON.parse(await fs.readFile(fixturePath, 'utf8')) as SerializedEditorState;
    const docId = 'runtimeDoc';

    const runtime = prepareEditorStateForRuntime(persisted, docId);
    const runtimeLinks = collectNoteLinkNodes(runtime);
    const runtimeSameDoc = runtimeLinks.find((node) => node.noteId === 'note2')!;
    const runtimeCrossDoc = runtimeLinks.find((node) => node.noteId === 'remoteNote')!;
    expect(runtimeSameDoc.docId).toBe(docId);
    expect(runtimeCrossDoc.docId).toBe('otherDoc');

    const compacted = prepareEditorStateForPersistence(runtime, docId);
    expect(compacted).toEqual(persisted);
  });
});
