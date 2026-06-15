/* eslint-disable node/no-process-env */
/**
 * Secret bootstrap for PRODUCTION / server mode (see docs/config.md "Secret
 * bootstrap").
 *
 * Operators set only ADMIN_SECRET. AUTH_SECRET and the Y-Sweet
 * auth_key / server_token pair resolve here on startup:
 *   environment variable if set -> else a persisted file in DATA_DIR ->
 *   else generate and persist there (0600).
 *
 * ADMIN_SECRET is never auto-generated.
 *
 * Emission mechanism (log-safe):
 *   The CLI prints `export VAR='value'` lines to STDOUT only. The Docker
 *   entrypoint consumes them with `eval "$(... bootstrap ...)"`, so the secret
 *   values flow straight into the entrypoint's environment and never reach a
 *   terminal or log file. STDERR carries only non-secret status text, so piping
 *   stderr to a log cannot leak a secret. (Single-quote shell escaping keeps the
 *   values inert.)
 *
 * Structure: the resolution logic is exported as pure functions (filesystem +
 * an injected Y-Sweet generator) so it is hermetically unit-testable. The CLI
 * edge (real `y-sweet gen-auth` spawn + stdout emission) lives in `main()`.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SECRETS_DIR_NAME = 'secrets';
const AUTH_SECRET_FILE = 'auth-secret';
const YSWEET_FILE = 'ysweet.json';

export interface YSweetPair {
  privateKey: string;
  serverToken: string;
}

export type YSweetGenerator = () => YSweetPair;

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

function secretsDir(dataDir: string): string {
  return path.join(dataDir, SECRETS_DIR_NAME);
}

function ensureSecretsDir(dataDir: string): string {
  const dir = secretsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdir honours the umask, so set the mode explicitly to guarantee 0700.
  fs.chmodSync(dir, 0o700);
  return dir;
}

function writeSecretFile(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents, { mode: 0o600 });
  // Match auth-secret behaviour: enforce 0600 even if the file pre-existed.
  fs.chmodSync(filePath, 0o600);
}

/**
 * Persistence guard. In production DATA_DIR must be a persistent mount. If we
 * are about to generate a *fresh* secret (the AUTH_SECRET or the Y-Sweet pair —
 * no env, no persisted file) but the dataset already exists, DATA_DIR is almost
 * certainly an ephemeral container FS that lost the secrets directory —
 * regenerating either secret would invalidate every existing session and break
 * collaboration auth against existing data. Fail loudly instead.
 *
 * Call this immediately before any fresh generation (auth OR Y-Sweet pair); the
 * env-set and file-load paths must NOT trigger it.
 *
 * "Dataset exists" is detected via the registry sqlite db or a non-empty collab
 * directory under DATA_DIR.
 */
function assertNoExistingDataset(dataDir: string, secretLabel: string): void {
  const sqlitePath = path.join(dataDir, 'remdo.sqlite');
  const collabDir = path.join(dataDir, 'collab');

  const hasSqlite = fs.existsSync(sqlitePath);
  const hasCollabData = fs.existsSync(collabDir)
    && fs.statSync(collabDir).isDirectory()
    && fs.readdirSync(collabDir).length > 0;

  if (hasSqlite || hasCollabData) {
    throw new Error(
      `Refusing to generate a new ${secretLabel}: DATA_DIR (${dataDir}) already holds a dataset `
      + `(${hasSqlite ? 'remdo.sqlite' : 'collab/'}) but no persisted secret. This usually means `
      + 'DATA_DIR is not a persistent mount, so the generated secret would invalidate existing '
      + 'sessions and break collaboration. Mount DATA_DIR persistently, or supply the secret '
      + 'via the environment.',
    );
  }
}

export interface ResolveAuthSecretArgs {
  dataDir: string;
  envValue: string | undefined;
}

export function resolveAuthSecret({ dataDir, envValue }: ResolveAuthSecretArgs): string {
  if (isPresent(envValue)) {
    return envValue;
  }

  const filePath = path.join(secretsDir(dataDir), AUTH_SECRET_FILE);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }

  // About to generate fresh: refuse if an existing dataset is present.
  assertNoExistingDataset(dataDir, 'AUTH_SECRET');

  const generated = randomBytes(32).toString('base64url');
  ensureSecretsDir(dataDir);
  writeSecretFile(filePath, generated);
  return generated;
}

export interface ResolveYSweetPairArgs {
  dataDir: string;
  envAuthKey: string | undefined;
  envServerToken: string | undefined;
  generate: YSweetGenerator;
}

export function resolveYSweetPair({
  dataDir,
  envAuthKey,
  envServerToken,
  generate,
}: ResolveYSweetPairArgs): YSweetPair {
  if (isPresent(envAuthKey) && isPresent(envServerToken)) {
    return { privateKey: envAuthKey, serverToken: envServerToken };
  }

  const filePath = path.join(secretsDir(dataDir), YSWEET_FILE);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as YSweetPair;
    return { privateKey: parsed.privateKey, serverToken: parsed.serverToken };
  }

  // About to generate fresh: refuse if an existing dataset is present, so an
  // env-supplied AUTH_SECRET cannot let us silently rotate the Y-Sweet pair
  // against existing collab data.
  assertNoExistingDataset(dataDir, 'Y-Sweet auth pair');

  const pair = generate();
  ensureSecretsDir(dataDir);
  writeSecretFile(filePath, `${JSON.stringify(pair, null, 2)}\n`);
  return pair;
}

export interface ResolvedSecrets {
  authSecret: string;
  ysweetAuthKey: string;
  ysweetServerToken: string;
}

/**
 * Single-quote a value for safe inclusion in a POSIX `export VAR='...'` line.
 * A literal `'` is closed, escaped, and reopened: `'\''`.
 */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

export function formatExportLines(resolved: {
  authSecret: string;
  ysweetAuthKey: string;
  ysweetServerToken: string;
}): string {
  return [
    `export AUTH_SECRET=${shellSingleQuote(resolved.authSecret)}`,
    `export YSWEET_AUTH_KEY=${shellSingleQuote(resolved.ysweetAuthKey)}`,
    `export YSWEET_SERVER_TOKEN=${shellSingleQuote(resolved.ysweetServerToken)}`,
  ].join('\n');
}

export interface BootstrapArgs {
  dataDir: string;
  env: Record<string, string | undefined>;
  generateYSweet: YSweetGenerator;
}

export interface BootstrapResult {
  resolved: ResolvedSecrets;
  exportLines: string;
}

export function bootstrapSecrets({ dataDir, env, generateYSweet }: BootstrapArgs): BootstrapResult {
  const authSecret = resolveAuthSecret({ dataDir, envValue: env.AUTH_SECRET });
  const pair = resolveYSweetPair({
    dataDir,
    envAuthKey: env.YSWEET_AUTH_KEY,
    envServerToken: env.YSWEET_SERVER_TOKEN,
    generate: generateYSweet,
  });

  const resolved: ResolvedSecrets = {
    authSecret,
    ysweetAuthKey: pair.privateKey,
    ysweetServerToken: pair.serverToken,
  };

  return { resolved, exportLines: formatExportLines(resolved) };
}

/**
 * CLI edge: real Y-Sweet generation via `y-sweet gen-auth --json`.
 * Mapping: private_key -> YSWEET_AUTH_KEY, server_token -> YSWEET_SERVER_TOKEN.
 */
function generateYSweetPairFromBinary(): YSweetPair {
  const output = execFileSync('y-sweet', ['gen-auth', '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(output) as { private_key: string; server_token: string };
  return { privateKey: parsed.private_key, serverToken: parsed.server_token };
}

function main(): void {
  const dataDir = process.env.DATA_DIR;
  if (!isPresent(dataDir)) {
    process.stderr.write('bootstrap-secrets: DATA_DIR must be set\n');
    process.exit(1);
  }

  const { exportLines } = bootstrapSecrets({
    dataDir: dataDir.replace(/\/$/, ''),
    env: process.env,
    generateYSweet: generateYSweetPairFromBinary,
  });

  // Secrets leave the process only via stdout, consumed by the entrypoint's
  // `eval`. Never write secret values to stderr.
  process.stdout.write(`${exportLines}\n`);
}

// Run the CLI only when executed as the program entry, not when imported by
// tests. Under esbuild CJS bundling (the Docker artifact) `require.main` equals
// the entry `module`; when tests import this file via tsx that equality is
// false, so `main()` stays dormant.
if (typeof require !== 'undefined' && require.main === module) {
  try {
    main();
  } catch (error) {
    // Print the operator-facing message only (never a secret) and fail loudly.
    process.stderr.write(`bootstrap-secrets: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
