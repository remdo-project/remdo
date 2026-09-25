import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SerializedEditorState } from 'lexical';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { waitForEditorUpdate, withHeadlessEditor } from '../../src/headless/headless-editor';

const execute = promisify(execFile);

interface FixtureDocument {
  email: string;
  id?: string;
  title: string;
  content?: SerializedEditorState;
}

/** Create fresh fixtures in one Django process, then persist their content before returning. */
export async function createFixtureDocuments(documents: FixtureDocument[]): Promise<string[]> {
  if (documents.length === 0) return [];
  const { stdout } = await execute('./tools/django.sh', [
    'create_fixture_documents',
    JSON.stringify(documents.map(({ email, id, title }) => ({ email, id, title }))),
  ]);
  const ids = JSON.parse(stdout) as string[];
  for (const [index, { content }] of documents.entries()) {
    if (!content) continue;
    const id = ids[index]!;
    await withHeadlessEditor(id, async (editor, { persist }) => {
      const state = prepareEditorStateForRuntime(content, id);
      const loaded = waitForEditorUpdate(editor);
      editor.setEditorState(editor.parseEditorState(JSON.stringify(state)));
      await loaded;
      await persist();
    });
  }
  return ids;
}

/** Create a fresh fixture, optionally seeding content before any editor joins. */
export async function createFixtureDocument(
  document: Omit<FixtureDocument, 'content'>,
  content?: SerializedEditorState,
): Promise<string> {
  const [id] = await createFixtureDocuments([{ ...document, content }]);
  return id!;
}
