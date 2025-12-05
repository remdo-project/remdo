import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function readFixture(name: string): Promise<string> {
  const abs = path.resolve('tests/fixtures', `${name}.json`);
  return fs.readFile(abs, 'utf8');
}
