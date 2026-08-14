#!/usr/bin/env tsx
import process from 'node:process';

import { config } from '#config';
import type { AuthorizationServerMetadata } from './linking-preflight-lib';
import {
  assertAuthorizationServerOrigin,
  assertPublicSourceConfig,
  fetchSourceJson,
} from './linking-preflight-lib';

async function main(): Promise<void> {
  if (!config.env.ALLOW_SIGNUP) {
    throw new Error('Source linking requires ALLOW_SIGNUP=true on the development source.');
  }

  const metadataUrl = new URL('/.well-known/oauth-authorization-server', config.env.APP_ORIGIN);
  const metadata = await fetchSourceJson<AuthorizationServerMetadata>(
    metadataUrl,
    'Development source metadata',
  );
  assertAuthorizationServerOrigin(metadata, config.env.APP_ORIGIN);

  const sourceConfigUrl = new URL('/api/config', config.env.APP_ORIGIN);
  const sourceConfig = await fetchSourceJson<{ publicServer?: unknown }>(
    sourceConfigUrl,
    'Development source config',
  );
  assertPublicSourceConfig(sourceConfig);
  console.info(`Source: ${config.env.APP_ORIGIN}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
