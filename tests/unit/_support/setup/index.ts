import { beforeAll } from 'vitest';
import { registerAssertions } from './assertions';
import { bootstrapEnv } from './env';
import { registerLexicalTestHarness } from './lexical';

registerAssertions();
registerLexicalTestHarness();

beforeAll(async () => {
  await bootstrapEnv();
});
