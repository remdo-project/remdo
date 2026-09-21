import type { z } from 'zod';
import type { ClientKey, EnvKey } from './schema.ts';
import { CLIENT_KEY_LIST, envSchema } from './schema.ts';

type EnvGetter = (key: EnvKey) => string | boolean | undefined;

type ServerEnv = {
  [K in EnvKey]: z.infer<(typeof envSchema)[K]>;
};
type ClientEnv = Pick<ServerEnv, ClientKey>;

function parseValue(key: EnvKey, raw: string | boolean | undefined) {
  // Empty (or whitespace-only) strings fall back to the schema default, so a
  // stray-whitespace value can't silently coerce (e.g. a ' ' PORT -> 0).
  const isBlank = raw === undefined || (typeof raw === 'string' && raw.trim() === '');
  const normalized = isBlank ? undefined : typeof raw === 'boolean' ? String(raw) : raw;
  const result = envSchema[key].safeParse(normalized);
  if (!result.success) {
    // Name the offending variable; Zod's default message omits it.
    throw new Error(`Invalid value for ${key}: ${result.error.issues[0]?.message ?? 'invalid'}`);
  }
  return result.data;
}

function parseEnv(getValue: EnvGetter): ServerEnv {
  const keys = Object.keys(envSchema) as EnvKey[];
  const entries = keys.map((key) => [key, parseValue(key, getValue(key))] as const);
  return Object.fromEntries(entries) as ServerEnv;
}

function pickClientEnv(server: ServerEnv): ClientEnv {
  const entries = CLIENT_KEY_LIST.map((key) => [key, server[key]] as const);
  return Object.fromEntries(entries) as ClientEnv;
}

export function resolveConfig(getValue: EnvGetter) {
  const server = parseEnv(getValue);

  if (!server.NODE_ENV) {
    throw new Error('NODE_ENV is required; run via tools/env.sh.');
  }

  const client = pickClientEnv(server);
  const mode = server.NODE_ENV;

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
