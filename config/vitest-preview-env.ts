import { resolve } from 'node:path';
import process from 'node:process';

const previewCacheDir = resolve('data/.vitest-preview');

export function applyVitestPreviewCacheEnv(): void {
  process.env.TMPDIR ||= previewCacheDir;
  process.env.TMP ||= previewCacheDir;
  process.env.TEMP ||= previewCacheDir;
}
