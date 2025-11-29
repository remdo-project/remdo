/* eslint-disable node/no-process-env -- Vitest tooling requires temp env overrides */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Point Node's temp directory variables at a stable path.
 * On Windows, libraries typically read TMP/TEMP; on POSIX, TMPDIR covers it.
 */
export function setTmpDir(): void {
  const tmpPath = path.resolve('data/.vitest-tmp');
  mkdirSync(tmpPath, { recursive: true });
  process.env.TMPDIR = tmpPath;
  process.env.TMP = tmpPath;
  process.env.TEMP = tmpPath;
}
