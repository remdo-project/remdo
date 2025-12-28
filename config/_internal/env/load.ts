import { parseEnv, pickClientEnv } from './parse';
import { envSpec } from '../../spec';

type EnvGetter = (key: keyof typeof envSpec & string) => string | boolean | undefined;

export function loadEnv(getValue: EnvGetter) {
  const parsed = parseEnv(envSpec, getValue);
  const client = pickClientEnv(envSpec, parsed);
  const mode = typeof parsed.NODE_ENV === 'string' ? parsed.NODE_ENV : 'development';

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
