import { parseEnv, pickClientEnv } from './parse';
import { envSpec } from '../../spec';

type EnvGetter = (key: keyof typeof envSpec & string) => string | boolean | undefined;

export function loadEnv(getValue: EnvGetter) {
  const parsed = parseEnv(envSpec, getValue);
  const client = pickClientEnv(envSpec, parsed);
  if (typeof parsed.NODE_ENV !== 'string' || !parsed.NODE_ENV) {
    throw new Error('NODE_ENV is required; run via tools/env.sh.');
  }

  const mode = parsed.NODE_ENV;

  return {
    server: parsed,
    client,
    runtime: {
      mode,
      isDev: mode === 'development',
      isProd: mode === 'production',
    },
  };
}
