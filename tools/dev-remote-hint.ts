#!/usr/bin/env tsx
import os from 'node:os';
import { config } from '#config';

const remotePort = new URL(config.env.REMDO_DEV_REMOTE_ORIGIN).port;
const user = os.userInfo().username;
const host = os.hostname();

console.info('');
console.info('Remote RemDo dev server');
console.info(
  `  From your host browser, keep this tunnel open: ssh -L ${config.env.PORT_BASE}:localhost:${config.env.PORT_BASE} -L ${remotePort}:localhost:${remotePort} ${user}@${host}`,
);
console.info(`  Then open: http://localhost:${config.env.PORT_BASE}`);
console.info('');
