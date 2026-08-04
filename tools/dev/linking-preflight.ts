#!/usr/bin/env tsx
import process from 'node:process';

import { config } from '#config';
import type { AuthorizationServerMetadata } from './linking-preflight-lib';
import {
  assertAuthorizationServerOrigin,
  assertPublicSourceConfig,
} from './linking-preflight-lib';

async function main(): Promise<void> {
  if (!config.env.ALLOW_SIGNUP) {
    throw new Error('Source linking requires ALLOW_SIGNUP=true on the development source.');
  }

  const metadataUrl = new URL('/.well-known/oauth-authorization-server', config.env.APP_PUBLIC_URL);
  let response: Response;
  try {
    response = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`No development source is reachable at ${config.env.APP_PUBLIC_URL}. Start pnpm dev first.`);
  }
  if (!response.ok) {
    throw new Error(`Development source metadata returned HTTP ${response.status} at ${metadataUrl}.`);
  }

  const metadata = await response.json() as AuthorizationServerMetadata;
  assertAuthorizationServerOrigin(metadata, config.env.APP_PUBLIC_URL);

  const sourceConfigUrl = new URL('/api/config', config.env.APP_PUBLIC_URL);
  const sourceConfigResponse = await fetch(sourceConfigUrl, { signal: AbortSignal.timeout(5000) });
  if (!sourceConfigResponse.ok) {
    throw new Error(`Development source config returned HTTP ${sourceConfigResponse.status} at ${sourceConfigUrl}.`);
  }
  assertPublicSourceConfig(await sourceConfigResponse.json() as { publicServer?: unknown });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
