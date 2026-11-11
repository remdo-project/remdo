import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedEditorState } from 'lexical';
import { buildFixtureState } from '#tests-common/markdown-fixture';
import { restoreEditorStateDefaults } from './editor-state-defaults';

const FIXTURE_DIR = path.resolve('tests/fixtures');

/** Reads a fixture from its test document, `<name>.md`, or from `<name>.json` until it moves to one. */
export async function readFixtureState(name: string): Promise<SerializedEditorState> {
  const markdown = await fs.readFile(path.join(FIXTURE_DIR, `${name}.md`), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const state = markdown === null
    ? JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')) as SerializedEditorState
    : buildFixtureState(markdown);
  return restoreEditorStateDefaults(state);
}

export async function readFixture(name: string): Promise<string> {
  return JSON.stringify(await readFixtureState(name));
}

export async function listFixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  const names = entries.filter((entry) => /\.(?:md|json)$/.test(entry)).map((entry) => entry.replace(/\.(?:md|json)$/, ''));
  return [...new Set(names)].sort();
}
