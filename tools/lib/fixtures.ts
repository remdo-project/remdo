import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedEditorState } from 'lexical';
import { buildFixtureState } from '#tests-common/markdown-fixture';

const FIXTURE_DIR = path.resolve('tests/fixtures');

export async function readFixtureMarkdown(name: string): Promise<string> {
  return fs.readFile(path.join(FIXTURE_DIR, `${name}.md`), 'utf8');
}

export async function readFixtureState(name: string): Promise<SerializedEditorState> {
  return buildFixtureState(await readFixtureMarkdown(name));
}

export async function readFixture(name: string): Promise<string> {
  return JSON.stringify(await readFixtureState(name));
}

export async function listFixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  return entries.flatMap((entry) => /^(.+)\.md$/.exec(entry)?.[1] ?? []).sort();
}
