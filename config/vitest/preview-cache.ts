/* eslint-disable node/no-process-env -- vitest preview forces us to touch process env vars */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// Vitest Preview hardcodes tmp dir discovery and offers no config knob, so we
// override Node's temp envs before it boots to keep cache files under data/.
const previewCacheDir = resolve('data/.vitest-preview');

export function forceVitestPreviewCacheDir(): void {
  mkdirSync(previewCacheDir, { recursive: true });
  process.env.TMPDIR ||= previewCacheDir;
  process.env.TMP ||= previewCacheDir;
  process.env.TEMP ||= previewCacheDir;
}
