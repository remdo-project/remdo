import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedEditorState } from 'lexical';
import { restoreEditorStateDefaults } from './lexical-state';

export async function readFixture(name: string): Promise<string> {
  const abs = path.resolve('tests/fixtures', `${name}.json`);
  const raw = await fs.readFile(abs, 'utf8');
  const parsed = JSON.parse(raw) as SerializedEditorState;
  return JSON.stringify(restoreEditorStateDefaults(parsed));
}
