import type { z } from 'zod';
import type { EnvKey } from './schema';
import { CLIENT_KEYS, envSchema } from './schema';

type EnvGetter = (key: EnvKey) => string | boolean | undefined;

type ParsedEnv = {
  [K in EnvKey]: z.infer<(typeof envSchema)[K]>;
};

type ClientKey = (typeof CLIENT_KEYS) extends Set<infer T> ? T : never;
type ServerEnv = ParsedEnv & { AUTH_URL: string };
type ClientEnv = Pick<ParsedEnv, ClientKey>;

const MIN_AUTH_SECRET_LENGTH = 32;

function isAbsoluteHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function resolveLocalAuthHost(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function parseValue(schema: (typeof envSchema)[EnvKey], raw: string | boolean | undefined) {
  // Empty strings fall back to the schema default, matching the legacy loader.
  const normalized =
    raw === '' || raw === undefined ? undefined : typeof raw === 'boolean' ? String(raw) : raw;
  return schema.parse(normalized);
}

function parseEnv(getValue: EnvGetter): ParsedEnv {
  const keys = Object.keys(envSchema) as EnvKey[];
  const entries = keys.map((key) => [key, parseValue(envSchema[key], getValue(key))] as const);
  return Object.fromEntries(entries) as ParsedEnv;
}

function resolveAuthUrl(parsed: ParsedEnv): string {
  if (isAbsoluteHttpUrl(parsed.AUTH_URL)) {
    return parsed.AUTH_URL;
  }

  if (parsed.NODE_ENV !== 'production' && parsed.HOST && parsed.PORT > 0) {
    return `http://${resolveLocalAuthHost(parsed.HOST)}:${parsed.PORT}`;
  }

  if (isAbsoluteHttpUrl(parsed.APP_PUBLIC_URL)) {
    return parsed.APP_PUBLIC_URL;
  }

  return '';
}

function validateProdServer(parsed: ParsedEnv): void {
  // Production utilities such as backup load config without app auth secrets.
  // Once AUTH_SECRET is present, treat the process as the server app boundary.
  if (parsed.NODE_ENV !== 'production' || !parsed.AUTH_SECRET) {
    return;
  }

  if (parsed.AUTH_SECRET.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters long in production.`);
  }

  if (!parsed.APP_PUBLIC_URL) {
    throw new Error('APP_PUBLIC_URL is required in production server config.');
  }

  if (!parsed.ADMIN_SECRET) {
    throw new Error('ADMIN_SECRET is required in production server config.');
  }

  if (!parsed.YSWEET_SERVER_TOKEN) {
    throw new Error('YSWEET_SERVER_TOKEN is required in production server config.');
  }

  if (!isAbsoluteHttpUrl(parsed.APP_PUBLIC_URL)) {
    throw new Error('APP_PUBLIC_URL must be an absolute http(s) URL in production server config.');
  }
}

function pickClientEnv(server: ServerEnv): ClientEnv {
  const keys = [...CLIENT_KEYS] as ClientKey[];
  const entries = keys.map((key) => [key, server[key]] as const);
  return Object.fromEntries(entries) as ClientEnv;
}

export function resolveConfig(getValue: EnvGetter, options: { server?: boolean } = {}) {
  const parsed = parseEnv(getValue);

  if (!parsed.NODE_ENV) {
    throw new Error('NODE_ENV is required; run via tools/env.sh.');
  }

  if (options.server !== false) {
    validateProdServer(parsed);
  }

  const server: ServerEnv = {
    ...parsed,
    AUTH_URL: resolveAuthUrl(parsed),
  };
  const client = pickClientEnv(server);

  const mode = parsed.NODE_ENV;

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
