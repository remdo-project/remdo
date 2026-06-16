import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedEditorState } from 'lexical';
import { restoreEditorStateDefaults } from '#tests-common/editor-state-defaults';

export async function readFixtureState(name: string): Promise<SerializedEditorState> {
  const abs = path.resolve('tests/fixtures', `${name}.json`);
  const raw = await fs.readFile(abs, 'utf8');
  return restoreEditorStateDefaults(JSON.parse(raw) as SerializedEditorState);
}

export async function readFixture(name: string): Promise<string> {
  return JSON.stringify(await readFixtureState(name));
}
