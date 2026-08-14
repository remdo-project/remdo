#!/usr/bin/env tsx
import process from 'node:process';

import { config } from '#config';

process.stdout.write(config.env.APP_ORIGIN);
