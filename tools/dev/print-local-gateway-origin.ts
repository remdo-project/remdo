#!/usr/bin/env tsx
import process from 'node:process';

import { resolveLocalGatewayOrigin } from '#platform/net/origins';

process.stdout.write(resolveLocalGatewayOrigin());
