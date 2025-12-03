/* eslint-disable node/no-process-env -- Vitest tooling requires temp env overrides */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

interface TmpDirOptions {
  /**
   * Optional subfolder name to isolate temp files per runner.
   * Defaults to `vitest-tmp`.
   */
  subdir?: string;
}

/**
 * Point Node's temp directory variables at a stable path.
 * On Windows, libraries typically read TMP/TEMP; on POSIX, TMPDIR covers it.
 *
 * Use `subdir` to keep concurrent Vitest runs from sharing (and deleting)
 * the same cache directory.
 */
export function setTmpDir(options?: TmpDirOptions): string {
  const subdir = options?.subdir ?? 'vitest-tmp';
  const tmpPath = path.resolve('node_modules/.cache', subdir);
  mkdirSync(tmpPath, { recursive: true });
  process.env.TMPDIR = tmpPath;
  process.env.TMP = tmpPath;
  process.env.TEMP = tmpPath;
  return tmpPath;
}
