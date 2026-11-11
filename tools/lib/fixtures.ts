import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedEditorState } from 'lexical';
import { buildFixtureState } from '#tests-common/markdown-fixture';
import { restoreEditorStateDefaults } from './editor-state-defaults';

const FIXTURE_DIR = path.resolve('tests/fixtures');

/** A fixture's test document, or null for the invalid-schema states still kept as `<name>.json`. */
export async function readFixtureMarkdown(name: string): Promise<string | null> {
  return fs.readFile(path.join(FIXTURE_DIR, `${name}.md`), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

export async function readFixtureState(name: string): Promise<SerializedEditorState> {
  const markdown = await readFixtureMarkdown(name);
  if (markdown !== null) return buildFixtureState(markdown);
  const json = await fs.readFile(path.join(FIXTURE_DIR, `${name}.json`), 'utf8');
  return restoreEditorStateDefaults(JSON.parse(json) as SerializedEditorState);
}

export async function readFixture(name: string): Promise<string> {
  return JSON.stringify(await readFixtureState(name));
}

export async function listFixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  return entries.flatMap((entry) => /^(.+)\.md$/.exec(entry)?.[1] ?? []).sort();
}
