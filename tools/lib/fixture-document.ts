import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SerializedEditorState } from 'lexical';
import { prepareEditorStateForRuntime } from '#client/editor/runtime/editor-state-persistence';
import { waitForEditorUpdate, withHeadlessCollabSession } from '../../src/headless/collab-session';

const execute = promisify(execFile);

/** Create a fresh fixture, optionally seeding content before any editor joins. */
export async function createFixtureDocument(
  document: { email: string; id?: string; title: string },
  content?: SerializedEditorState,
): Promise<string> {
  const { stdout } = await execute('./tools/django.sh', [
    'create_fixture_document',
    `--email=${document.email}`, `--title=${document.title}`,
    ...(document.id === undefined ? [] : [`--id=${document.id}`]),
  ]);
  const { id } = JSON.parse(stdout) as { id: string };
  if (content) {
    await withHeadlessCollabSession(id, (editor) => {
      const state = prepareEditorStateForRuntime(content, id);
      const loaded = waitForEditorUpdate(editor);
      editor.setEditorState(editor.parseEditorState(JSON.stringify(state)));
      return loaded;
    }, { waitForPersist: true });
  }
  return id;
}
