import { applyEnvDerivatives, parseEnv, pickClientEnv } from './parse';
import { envDerivedDefaults, envSpec } from '../../spec';

type EnvGetter = (key: keyof typeof envSpec & string) => string | boolean | undefined;

export function loadEnv(getValue: EnvGetter) {
  const parsed = parseEnv(envSpec, getValue);
  const server = applyEnvDerivatives(parsed, envDerivedDefaults);
  const client = pickClientEnv(envSpec, server);
  const mode = typeof server.NODE_ENV === 'string' ? server.NODE_ENV : 'development';

  return {
    server,
    client,
    runtime: {
      mode,
      isDev: mode === 'development',
      isProd: mode === 'production',
    },
  };
}
