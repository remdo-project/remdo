#!/usr/bin/env tsx
/* eslint-disable node/no-process-env -- script scaffolds env vars before spawning preview */
// Launches Vitest Preview with ports/env resolved through the shared config module.
import process from 'node:process';

import { config } from '#config';
import { forceVitestPreviewCacheDir } from '#config/vitest/preview-cache';
import { spawnPnpm } from './lib/process';

process.env.NODE_ENV ??= 'test';

process.env.HOST = config.env.HOST;
process.env.PORT = String(config.env.VITEST_PREVIEW_PORT);
process.env.VITEST_PREVIEW = 'true';

forceVitestPreviewCacheDir();

spawnPnpm(['exec', 'vitest-preview'], process.env);
