import { beforeAll } from 'vitest';
import './assertions';
import { bootstrapEnv } from './env';
import './lexical';

beforeAll(async () => {
  await bootstrapEnv();
});
