import { beforeAll } from 'vitest';
import './_internal/assertions';
import { bootstrapEnv } from './_internal/env';
import './_internal/lexical';

beforeAll(async () => {
  await bootstrapEnv();
});
