import { resolve } from 'node:path';
import process from 'node:process';
import { env } from './env.server';

const previewCacheDir = resolve('data/.vitest-preview');

export const VITEST_PREVIEW_CACHE_DIR = previewCacheDir;

export function applyVitestPreviewCacheEnv(): void {
  process.env.TMPDIR ||= previewCacheDir;
  process.env.TMP ||= previewCacheDir;
  process.env.TEMP ||= previewCacheDir;
}

export { env };
