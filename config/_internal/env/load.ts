import { parseEnv, pickClientEnv } from './parse';
import { envSpec } from '../../spec';

type EnvGetter = (key: keyof typeof envSpec & string) => string | boolean | undefined;
const MIN_AUTH_SECRET_LENGTH = 32;
type ParsedServerEnv = ReturnType<typeof parseEnv<typeof envSpec>>;
type ResolvedServerEnv = ParsedServerEnv & { AUTH_URL: string };

function resolveAuthUrl(parsed: ParsedServerEnv): string {
  if (parsed.APP_PUBLIC_URL.startsWith('http://') || parsed.APP_PUBLIC_URL.startsWith('https://')) {
    return parsed.APP_PUBLIC_URL;
  }

  if (parsed.NODE_ENV !== 'production' && parsed.HOST && parsed.PORT > 0) {
    return `http://${parsed.HOST}:${parsed.PORT}`;
  }

  return '';
}

function resolveServerEnv(
  parsed: ParsedServerEnv,
  options: { validateServer?: boolean } = {},
): ResolvedServerEnv {
  const authUrl = resolveAuthUrl(parsed);
  const validateServer = options.validateServer ?? true;

  if (!validateServer || parsed.NODE_ENV !== 'production' || !parsed.AUTH_SECRET) {
    return {
      ...parsed,
      AUTH_URL: authUrl,
    };
  }

  if (parsed.AUTH_SECRET.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters long in production.`);
  }

  return {
    ...parsed,
    AUTH_URL: authUrl,
  };
}

export function loadEnv(getValue: EnvGetter, options: { server?: boolean } = {}) {
  const parsed = parseEnv(envSpec, getValue);
  if (typeof parsed.NODE_ENV !== 'string' || !parsed.NODE_ENV) {
    throw new Error('NODE_ENV is required; run via tools/env.sh.');
  }

  const server = resolveServerEnv(parsed, {
    validateServer: options.server !== false,
  });
  const client = pickClientEnv(envSpec, server);

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
