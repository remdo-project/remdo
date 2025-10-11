// forces Vitest Preview to keep it's cache folder in data/
// env files can't generate absolute paths, so wire TMP* here instead
import { resolve } from 'node:path';
import process from 'node:process';

const previewCacheDir = resolve('data/.vitest-preview');

if (!process.env.TMPDIR) process.env.TMPDIR = previewCacheDir;
if (!process.env.TMP) process.env.TMP = previewCacheDir;
if (!process.env.TEMP) process.env.TEMP = previewCacheDir;
