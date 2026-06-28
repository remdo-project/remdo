import type { z } from 'zod';
import { resolveLoopbackHost } from '../../src/platform/net/loopback';
import { deriveAuthTrustedOrigins } from './auth-origins';
import type { ClientKey, EnvKey } from './schema';
import { CLIENT_KEY_LIST, envSchema } from './schema';

type EnvGetter = (key: EnvKey) => string | boolean | undefined;

type ParsedEnv = {
  [K in EnvKey]: z.infer<(typeof envSchema)[K]>;
};

type ServerEnv = ParsedEnv & { AUTH_URL: string; AUTH_TRUSTED_ORIGINS: string[] };
type ClientEnv = Pick<ParsedEnv, ClientKey>;

const MIN_AUTH_SECRET_LENGTH = 32;

function isAbsoluteHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

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

function parseEnv(getValue: EnvGetter): ParsedEnv {
  const keys = Object.keys(envSchema) as EnvKey[];
  const entries = keys.map((key) => [key, parseValue(key, getValue(key))] as const);
  return Object.fromEntries(entries) as ParsedEnv;
}

function resolveAuthUrl(parsed: ParsedEnv): string {
  if (isAbsoluteHttpUrl(parsed.AUTH_URL)) {
    return parsed.AUTH_URL;
  }

  if (parsed.NODE_ENV !== 'production' && parsed.HOST && parsed.PORT > 0) {
    return `http://${resolveLoopbackHost(parsed.HOST, 'localhost')}:${parsed.PORT}`;
  }

  if (isAbsoluteHttpUrl(parsed.APP_PUBLIC_URL)) {
    return parsed.APP_PUBLIC_URL;
  }

  return '';
}

function validateProdServer(parsed: ParsedEnv): void {
  // The app-server boundary is signalled by AUTH_SECRET being present: the
  // container bootstraps it for the API process, while operational utilities
  // (backup/snapshot, run via `env -u AUTH_SECRET` in the entrypoint) load this
  // same config without it and must skip the server-only requirement checks.
  // This is intentional, not a "secret happens to be set" coincidence.
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

  // The Y-Sweet auth_key/server_token pair is auto-bootstrapped (never an operator
  // input), so it is not validated here. The Docker entrypoint asserts the
  // bootstrap produced both before splitting them across processes — and the API
  // process is deliberately started without YSWEET_AUTH_KEY (it only needs the
  // server token), so requiring either key at this boundary would be wrong.

  if (!isAbsoluteHttpUrl(parsed.APP_PUBLIC_URL)) {
    throw new Error('APP_PUBLIC_URL must be an absolute http(s) URL in production server config.');
  }
}

function pickClientEnv(server: ServerEnv): ClientEnv {
  const entries = CLIENT_KEY_LIST.map((key) => [key, server[key]] as const);
  return Object.fromEntries(entries) as ClientEnv;
}

export function resolveConfig(
  getValue: EnvGetter,
  options: { server?: boolean; machineHostname?: string } = {},
) {
  const parsed = parseEnv(getValue);

  if (!parsed.NODE_ENV) {
    throw new Error('NODE_ENV is required; run via tools/env.sh.');
  }

  if (options.server !== false) {
    validateProdServer(parsed);
  }

  const authUrl = resolveAuthUrl(parsed);
  const server: ServerEnv = {
    ...parsed,
    AUTH_URL: authUrl,
    // The machine hostname (a Node-only value) is injected by the caller so this
    // resolver stays runtime-agnostic; the browser passes none.
    AUTH_TRUSTED_ORIGINS: deriveAuthTrustedOrigins({
      baseURL: authUrl,
      isProduction: parsed.NODE_ENV === 'production',
      hostname: options.machineHostname ?? '',
      previewPort: parsed.PREVIEW_PORT,
    }),
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
