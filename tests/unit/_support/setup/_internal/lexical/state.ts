import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import { $getRoot } from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';
import type { LexicalTestHelpers } from '../../../lib/types';

async function lexicalLoad(
  editor: LexicalEditor,
  filename: string,
  waitForReady: () => Promise<void>
): Promise<void> {
  const absPath = path.resolve(process.cwd(), 'tests/fixtures', `${filename}.json`);

  let json: string;
  try {
    json = readFileSync(absPath, 'utf8');
  } catch (err) {
    throw new Error(
      `Failed to read file at ${absPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let editorState;
  try {
    const parsed = JSON.parse(json);
    const stateJson = JSON.stringify(parsed.editorState);
    editorState = editor.parseEditorState(stateJson);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from ${absPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  editor.setEditorState(editorState);

  await waitForReady();
}

async function lexicalMutate(
  editor: LexicalEditor,
  fn: () => void,
  opts: EditorUpdateOptions = {}
): Promise<void> {
  if (fn.constructor.name === 'AsyncFunction') {
    throw new TypeError(
      'lexicalMutate does not support async callbacks. Prepare any async work before calling lexicalMutate.'
    );
  }

  const timeoutMs = 1000;
  const uniqueTag = `test:${Date.now()}:${Math.random()}`;
  const tags = [uniqueTag, ...([opts.tag ?? []].flat())];

  return new Promise<void>((resolve, reject) => {
    const off = editor.registerUpdateListener(({ tags: updateTags }) => {
      if (updateTags.has(uniqueTag)) {
        try {
          const state = editor.getEditorState().toJSON();
          assertEditorSchema(state);
          cleanup();
          resolve();
        } catch (error) {
          cleanup();
          reject(error);
        }
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `lexicalMutate timed out waiting for commit (tag: ${uniqueTag}), did you run editor.update() and made any changes in it?`
        )
      );
    }, timeoutMs);

    function cleanup() { clearTimeout(timer); off(); }

    try {
      editor.update(fn, { ...opts, tag: tags });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

function lexicalValidate<T>(editor: LexicalEditor, fn: () => T): T {
  return editor.getEditorState().read(fn);
}

function lexicalGetEditorState(editor: LexicalEditor) {
  return editor.getEditorState().toJSON();
}

function rootIsCanonical(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const first = $getRoot().getFirstChild();
    if (!$isListNode(first)) return false;
    const children = first.getChildren();
    return first.getNextSibling() === null && children.length > 0 && children.every($isListItemNode);
  });
}

export function createLexicalTestHelpers(
  editor: LexicalEditor,
  getCollabStatus: () => CollaborationStatusValue
): LexicalTestHelpers {
  async function waitForSynced(): Promise<void> {
    await getCollabStatus().awaitSynced();
    await waitFor(() => expect(rootIsCanonical(editor)).toBe(true));
  }

  function getCollabDocId(): string {
    return getCollabStatus().docId;
  }

  const helpers: LexicalTestHelpers = {
    editor,
    load: (filename: string) => lexicalLoad(editor, filename, waitForSynced),
    mutate: (fn: () => void, opts?: EditorUpdateOptions) => lexicalMutate(editor, fn, opts),
    validate: <T>(fn: () => T) => lexicalValidate(editor, fn),
    getEditorState: () => lexicalGetEditorState(editor),
    waitForSynced,
    getCollabDocId,
  };

  return helpers;
}
