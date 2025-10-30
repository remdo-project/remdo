import type { EditorUpdateOptions, LexicalEditor } from 'lexical';
import { $getRoot } from 'lexical';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { assertEditorSchema } from '@/editor/schema/assertEditorSchema';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import type { LexicalTestHelpers } from './types';

function lexicalLoad(
  editor: LexicalEditor,
  filename: string
): void {
  const absPath = resolve(process.cwd(), 'tests/fixtures', `${filename}.json`);

  let json: string;
  try {
    json = readFileSync(absPath, 'utf-8');
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

export function createLexicalTestHelpers(
  editor: LexicalEditor,
  getCollabStatus: () => CollaborationStatusValue | null
): LexicalTestHelpers {
  async function waitForCollabSync(): Promise<void> {
    await getCollabStatus()?.waitForSync();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  function hasCollabUnsyncedChanges(): boolean {
    return Boolean(getCollabStatus()?.hasUnsyncedChanges);
  }

  async function resetDocument(): Promise<void> {
    const collab = getCollabStatus();
    if (!collab?.enabled) {
      return;
    }

    await waitForCollabSync();

    await lexicalMutate(editor, () => {
      $getRoot().clear();
    });

    await waitForCollabSync();
  }

  return {
    editor,
    load: (filename: string) => lexicalLoad(editor, filename),
    mutate: (fn, opts) => lexicalMutate(editor, fn, opts),
    validate: (fn) => lexicalValidate(editor, fn),
    getEditorState: () => lexicalGetEditorState(editor),
    waitForCollabSync,
    hasCollabUnsyncedChanges,
    resetDocument,
  } as LexicalTestHelpers;
}
