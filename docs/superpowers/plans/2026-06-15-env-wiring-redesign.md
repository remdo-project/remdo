# Env Wiring Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
(recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a single TypeScript module the sole owner of runtime configuration — schema,
derivation, server/client split, validation, and secret bootstrap — per the contract in
[docs/config.md](../../config.md).

**Architecture:** Sequenced sub-plans A→D, each independently testable and committable. Plan A
(this file, fully detailed) introduces the config owner on top of `@t3-oss/env-core` + Zod while
keeping every resolved value byte-identical, so the ~30 downstream `config.env.*` consumers do
not change. Plans B–D (outlined at the end) then change behavior: port regimes, secret
bootstrap, and the docker/render/surface cleanup.

**Tech Stack:** TypeScript, `@t3-oss/env-core`, Zod, Vite, Vitest, pnpm, POSIX sh, Docker.

**Source of truth:** [docs/config.md](../../config.md). Sequencing notes:
[docs/todo.md](../../todo.md) "Env wiring redesign".

---

## Plan A — Config owner core (behavior-preserving)

The current loader is `config/_internal/env/load.ts` (`loadEnv`) +
`config/_internal/env/parse.ts` (`parseEnv`/`pickClientEnv`) + `config/spec.ts` (`envSpec`),
surfaced by `config/index.ts` as the `config` singleton. Plan A replaces the *internals* with a
Zod/t3-env owner while preserving the public surface exactly: `config.env`, `config.server`,
`config.browser`, `config.runtime`, `config.mode`, `config.dev`, `config.prod`, `config.isDev`,
`config.isProd`, `config.isTest`, `config.isDevOrTest`. No downstream file changes in Plan A.

**Invariant for Plan A:** every value `config.env.*` resolves to must equal what it resolved to
before. Port offsets, secret defaults, and `AUTH_URL` derivation are copied as-is from
`tools/env.defaults.sh` and `load.ts`; they only *move*. Behavior changes happen in B–D.

### File Structure (Plan A)

- Create: `config/env/schema.ts` — the Zod schema of all variables (inputs + currently-derived),
  one place, replacing `config/spec.ts`.

- Create: `config/env/resolve.ts` — the pure `resolve(getValue, options)` core: parse via the
  schema, derive `AUTH_URL`, split server/client, run prod validation. Replaces
  `config/_internal/env/load.ts` + `config/_internal/env/parse.ts`.

- Modify: `config/index.ts` — call the new `resolve` instead of `loadEnv`; keep the exported `config` shape identical.
- Modify: `package.json` — add `@t3-oss/env-core` and `zod`; repoint the `#config/_internal/env/*`
  consumers (only the test below imports them).

- Delete (end of Plan A): `config/spec.ts`, `config/_internal/env/load.ts`, `config/_internal/env/parse.ts`.
- Test: `tests/unit/config-env.spec.ts` — rewrite against the new owner; keep the `tools/env.sh`
  shell-parity assertions (shell is untouched in Plan A).

### Task A1: Add dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add zod and @t3-oss/env-core**

Run:

```bash
pnpm add zod @t3-oss/env-core
```

Expected: both land in `dependencies`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Verify versions resolved**

Run:

```bash
node -e "const p=require('./package.json');console.log(p.dependencies.zod, p.dependencies['@t3-oss/env-core'])"
```

Expected: two non-empty version strings print.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(config): add zod and @t3-oss/env-core for the config owner"
```

### Task A2: Write the schema module

**Files:**

- Create: `config/env/schema.ts`

The schema mirrors the *current* `config/spec.ts` keys and their parse-time types, expressed in
Zod. Booleans accept the strings `"true"`/`"false"`; ports are integers `0..65535`; the rest are
strings. `client: true` keys from the old spec become a constant `CLIENT_KEYS` set so the split
stays declarative. This is a behavior-preserving move: same keys, same coercion, same defaults.

- [ ] **Step 1: Write the schema**

```ts
import { z } from 'zod';

// Reusable coercions matching the previous parse.ts behavior.
const boolish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
  .default(false);

const port = z.coerce
  .number()
  .int()
  .min(0)
  .max(65_535)
  .default(0);

const str = z.string().default('');

// One schema entry per variable. Keys and defaults match config/spec.ts.
export const envSchema = {
  NODE_ENV: str,
  DATA_DIR: str,
  HOST: str,
  PORT_BASE: port,
  PORT: port,
  HMR_PORT: port,
  COLLAB_ENABLED: boolish,
  COLLAB_SERVER_PORT: port,
  API_SERVER_PORT: port,
  DEV_DOCUMENT_ID: str,
  YSWEET_CONNECTION_STRING: str,
  YSWEET_AUTH_KEY: str,
  YSWEET_SERVER_TOKEN: str,
  AUTH_SECRET: str,
  ADMIN_SECRET: str,
  APP_PUBLIC_URL: str,
  AUTH_URL: str,
  LINKABLE_REMDO_SERVERS_JSON: str,
  REMDO_DEV_OAUTH_CLIENT_ID: str,
  REMDO_DEV_OAUTH_CLIENT_SECRET: str,
  REMDO_DEV_HOME_ORIGIN: str,
  ALLOW_SIGNUP: boolish,
  PREVIEW_PORT: port,
  VITEST_PORT: port,
  VITEST_PREVIEW_PORT: port,
  PLAYWRIGHT_UI_PORT: port,
  CI: boolish,
  VITEST_PREVIEW: boolish,
} as const;

export type EnvKey = keyof typeof envSchema;

// Keys that the previous spec marked `client: true`.
export const CLIENT_KEYS = new Set<EnvKey>([
  'COLLAB_ENABLED',
  'DEV_DOCUMENT_ID',
]);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no consumers reference this module yet).

- [ ] **Step 3: Commit**

```bash
git add config/env/schema.ts
git commit -m "feat(config): add Zod env schema mirroring the previous spec"
```

### Task A3: Write the resolver — test first

**Files:**

- Create: `config/env/resolve.ts`
- Test: `tests/unit/config-env.spec.ts` (rewrite)

The resolver reproduces `load.ts` exactly: require `NODE_ENV`; derive `AUTH_URL`
(absolute `AUTH_URL` wins; else non-prod local origin from `HOST`/`PORT`; else
absolute `APP_PUBLIC_URL`; else empty); split the client subset via `CLIENT_KEYS`;
in production with `AUTH_SECRET` set, enforce the five prod checks (min length 32,
`APP_PUBLIC_URL` present + absolute, `ADMIN_SECRET` present, `YSWEET_SERVER_TOKEN`
present).

- [ ] **Step 1: Write the failing test**

Replace `tests/unit/config-env.spec.ts` with assertions against the new owner. Keep the existing
shell-parity helper (`readEnvShValue` via `tools/env.sh`) unchanged — the shell is untouched in
Plan A, so parity must still hold.

```ts
/* eslint-disable node/no-process-env */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '#config/env/resolve';
import { envSchema, type EnvKey } from '#config/env/schema';

type EnvValues = Partial<Record<EnvKey, string | boolean>>;

function load(values: EnvValues, options?: Parameters<typeof resolveConfig>[1]) {
  return resolveConfig((key) => values[key], options);
}

describe('config owner', () => {
  it('reads DATA_DIR from inputs', () => {
    expect(load({ NODE_ENV: 'test', DATA_DIR: '/repo/data' }).server.DATA_DIR).toBe('/repo/data');
  });

  it('requires NODE_ENV', () => {
    expect(() => load({})).toThrow('NODE_ENV is required; run via tools/env.sh.');
  });

  it('derives AUTH_URL from HOST and PORT outside production', () => {
    expect(load({ NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4000' }).server.AUTH_URL)
      .toBe('http://127.0.0.1:4000');
  });

  it('localhostizes 0.0.0.0 in the derived AUTH_URL', () => {
    expect(load({ NODE_ENV: 'development', HOST: '0.0.0.0', PORT: '4000' }).server.AUTH_URL)
      .toBe('http://localhost:4000');
  });

  it('uses APP_PUBLIC_URL for AUTH_URL in production', () => {
    const loaded = load({
      NODE_ENV: 'production',
      APP_PUBLIC_URL: 'https://app.example.com',
      AUTH_SECRET: 'x'.repeat(32),
      ADMIN_SECRET: 'admin',
      YSWEET_SERVER_TOKEN: 'tok',
    });
    expect(loaded.server.AUTH_URL).toBe('https://app.example.com');
  });

  it('rejects a short AUTH_SECRET in production', () => {
    expect(() => load({
      NODE_ENV: 'production',
      APP_PUBLIC_URL: 'https://app.example.com',
      AUTH_SECRET: 'short',
      ADMIN_SECRET: 'admin',
      YSWEET_SERVER_TOKEN: 'tok',
    })).toThrow('AUTH_SECRET must be at least 32 characters long in production.');
  });

  it('exposes only client keys in the browser subset', () => {
    const loaded = load({ NODE_ENV: 'test', COLLAB_ENABLED: 'true', DEV_DOCUMENT_ID: 'd' });
    expect(Object.keys(loaded.client).sort()).toEqual(['COLLAB_ENABLED', 'DEV_DOCUMENT_ID']);
  });

  it('matches tools/env.sh for derived ports (shell parity)', () => {
    const shellPort = execFileSync('./tools/env.sh', ['sh', '-c', 'printf %s "$COLLAB_SERVER_PORT"'], {
      env: { ...process.env, NODE_ENV: 'development', PORT_BASE: '4000', PORT: '4000' },
      encoding: 'utf8',
    });
    expect(shellPort).toBe('4004');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm run test:unit:full tests/unit/config-env.spec.ts`
Expected: FAIL — `#config/env/resolve` not found.

- [ ] **Step 3: Write the resolver**

```ts
import { z } from 'zod';
import { CLIENT_KEYS, envSchema, type EnvKey } from './schema';

const MIN_AUTH_SECRET_LENGTH = 32;
const schema = z.object(envSchema);
type ParsedEnv = z.infer<typeof schema>;
export type ResolvedEnv = ParsedEnv & { AUTH_URL: string };

type Getter = (key: EnvKey) => string | boolean | undefined;

function localhostize(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function deriveAuthUrl(env: ParsedEnv): string {
  if (env.AUTH_URL.startsWith('http://') || env.AUTH_URL.startsWith('https://')) {
    return env.AUTH_URL;
  }
  if (env.NODE_ENV !== 'production' && env.HOST && env.PORT > 0) {
    return `http://${localhostize(env.HOST)}:${env.PORT}`;
  }
  if (env.APP_PUBLIC_URL.startsWith('http://') || env.APP_PUBLIC_URL.startsWith('https://')) {
    return env.APP_PUBLIC_URL;
  }
  return '';
}

function validateProd(env: ResolvedEnv): void {
  if (env.NODE_ENV !== 'production' || !env.AUTH_SECRET) {
    return;
  }
  if (env.AUTH_SECRET.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters long in production.`);
  }
  if (!env.APP_PUBLIC_URL) {
    throw new Error('APP_PUBLIC_URL is required in production server config.');
  }
  if (!env.ADMIN_SECRET) {
    throw new Error('ADMIN_SECRET is required in production server config.');
  }
  if (!env.YSWEET_SERVER_TOKEN) {
    throw new Error('YSWEET_SERVER_TOKEN is required in production server config.');
  }
  if (!env.APP_PUBLIC_URL.startsWith('http://') && !env.APP_PUBLIC_URL.startsWith('https://')) {
    throw new Error('APP_PUBLIC_URL must be an absolute http(s) URL in production server config.');
  }
}

export function resolveConfig(getValue: Getter, options: { server?: boolean } = {}) {
  const raw: Record<string, string | boolean | undefined> = {};
  for (const key of Object.keys(envSchema) as EnvKey[]) {
    const value = getValue(key);
    if (value !== undefined && value !== '') {
      raw[key] = value;
    }
  }

  const parsed = schema.parse(raw);
  if (!parsed.NODE_ENV) {
    throw new Error('NODE_ENV is required; run via tools/env.sh.');
  }

  const server: ResolvedEnv = { ...parsed, AUTH_URL: deriveAuthUrl(parsed) };
  if (options.server !== false) {
    validateProd(server);
  }

  const client: Partial<ResolvedEnv> = {};
  for (const key of CLIENT_KEYS) {
    client[key] = server[key];
  }

  const mode = parsed.NODE_ENV;
  return {
    server,
    client,
    runtime: { mode, isDev: mode === 'development', isProd: mode === 'production' },
  };
}
```

- [ ] **Step 4: Add the `#config/env/*` import alias if needed**

Check `package.json` `imports`/`tsconfig.json` `paths`. The existing alias is `"#config":
"./config/index.ts"`. If subpath imports like `#config/env/resolve` do not already resolve, add
`"#config/*": "./config/*"` alongside it (mirror in `tsconfig.json` `paths`). Run `pnpm run
typecheck` to confirm resolution.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm run test:unit:full tests/unit/config-env.spec.ts`
Expected: PASS (all cases including shell parity `4004`).

- [ ] **Step 6: Commit**

```bash
git add config/env/resolve.ts tests/unit/config-env.spec.ts package.json tsconfig.json
git commit -m "feat(config): add pure resolver with AUTH_URL derivation and prod validation"
```

### Task A4: Point the config singleton at the new owner

**Files:**

- Modify: `config/index.ts`

`config/index.ts` currently calls `loadEnv` and assembles the `config` object.
Swap to `resolveConfig`; keep the assembled shape byte-identical.

- [ ] **Step 1: Update the imports and calls**

Replace the `loadEnv` import with `resolveConfig` from `#config/env/resolve`. In
the Node branch, call `resolveConfig((key) => process.env[key])`; in the browser
branch, call `resolveConfig((key) => …vite lookup…, { server: false })` (keep the
existing `VITE_`-prefix lookup logic). Keep the rest of the file (`runtime`,
`serverEnv`, `browserEnv`, the `env` cast, and the exported `config` object)
unchanged.

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the unit suite**

Run: `pnpm run test:unit`
Expected: PASS — downstream consumers see identical `config.env.*` values.

- [ ] **Step 4: Run the collab suite (config touches collab/auth token paths)**

Run: `pnpm run test:collab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/index.ts
git commit -m "refactor(config): resolve the config singleton through the new owner"
```

### Task A5: Delete the superseded modules

**Files:**

- Delete: `config/spec.ts`, `config/_internal/env/load.ts`,
  `config/_internal/env/parse.ts`

- [ ] **Step 1: Confirm no remaining importers**

Run:

```bash
rg -n "config/spec|_internal/env/load|_internal/env/parse" --glob '!docs/**'
```

Expected: no hits outside the files being deleted.

- [ ] **Step 2: Delete the files**

Run:

```bash
git rm config/spec.ts config/_internal/env/load.ts config/_internal/env/parse.ts
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(config): remove the superseded spec/load/parse modules"
```

### Task A6: Plan A final checks

- [ ] **Step 1: Full required checks**

Run: `pnpm run lint && pnpm run test:unit && pnpm run test:collab`
Expected: all PASS. Plan A is behavior-preserving, so green here means the owner swap is safe.

- [ ] **Step 2: Confirm the public surface is unchanged**

Run:

```bash
rg -n "config\.(env|server|browser|runtime|mode|dev|prod|isDev|isProd|isTest|isDevOrTest)\b" src | wc -l
```

Expected: same consumer count as before Plan A (no consumer edits were needed).

---

## Plan B — Port regimes (outline)

**Goal:** dev/test derive `PORT` and all secondary ports from `PORT_BASE` in the
owner; prod uses fixed internal constants and an independent listen `PORT`
(injected, else `8080`); shell stops deriving.

- Move the `PORT_BASE`+offset table (HMR +1, Vitest preview +3, collab +4,
  preview +5, Playwright UI +6, API +11) from `tools/env.defaults.sh` into the
  owner; in dev/test `PORT = PORT_BASE`.

- Make prod secondary ports fixed constants; make `PORT` an independent input
  defaulting to `8080`, honoring a platform-injected value.

- Delete `RUN_MODE_PORT_SHIFT`, `REMDO_PRESERVE_PORT`, and the `+40` machinery
  from `tools/env.defaults.sh` and `tools/prod/docker.sh`.

- Reduce `tools/env.sh`/`env.defaults.sh` to "load `.env`, export raw inputs,
  exec"; ports now come from the owner.

- Tests: update `tests/unit/config-env.spec.ts` port-parity cases and
  `tests/unit/prod-docker-launcher.spec.ts`; remove the now-invalid "set both
  PORT and PORT_BASE" expectations.

- Verify: dev stack runs on `PORT_BASE` alone; `tests/e2e/docker` prod path binds
  the injected `PORT`.

## Plan C — Secret bootstrap (outline)

**Goal:** operators set only `ADMIN_SECRET`; `AUTH_SECRET` and the Y-Sweet pair
resolve `env → DATA_DIR file → generate+persist`.

- Add a bootstrap module: for `AUTH_SECRET`, generate via `crypto.randomBytes`;
  for the Y-Sweet pair, shell out to `y-sweet gen-auth --json` and persist both
  `private_key` (→ `YSWEET_AUTH_KEY`) and `server_token`.

- Persist to files under `DATA_DIR` with `0600`; load if present; generate+persist
  if absent.

- Add the loud guard: in production, if `DATA_DIR` is not a persistent/writable
  mount, fail at startup rather than regenerate against an existing dataset.

- Wire the startup wrapper (the entrypoint path) to resolve + bootstrap, then exec.
- Remove the hardcoded dev secret defaults from `tools/env.defaults.sh`.
- Tests: first-run generates and persists; restart reuses; `tests/unit/server/collab-token.spec.ts` still green.

## Plan D — Surfaces & cleanup (outline)

**Goal:** reduce the operator-facing input surface and confirm the full prod path.

- `.env.example`: reduce to `ADMIN_SECRET`, `APP_PUBLIC_URL`, `PORT_BASE`, optional
  `ALLOW_SIGNUP`/remote vars; drop the manual `AUTH_SECRET`/Y-Sweet pair.

- `render.yaml`: keep `ADMIN_SECRET` + `APP_PUBLIC_URL` (`sync: false`) and the
  persistent disk; drop the manual secret keys and the `PORT_BASE`-derived
  internal-port assumptions; ensure the service binds the injected `PORT`.

- `tools/prod/docker.sh`: pass raw inputs only; resolution happens in the entrypoint.
- Reconcile any remaining drift in `docs/run-modes.md` against `docs/config.md`.
- Final: `pnpm run lint && pnpm run test:unit:full && pnpm run test:collab:full`,
  plus `pnpm test:e2e:docker` for the prod path.

---

## Self-Review (Plan A)

- **Spec coverage:** Plan A implements the "Resolution boundary" (single owner,
  server/client split, pure resolve) and the behavior-preserving parts of
  "Derivation rules" (`AUTH_URL`) and "Validation policy" (schema validation,
  prod checks). Port regimes → Plan B; secret bootstrap → Plan C; surface
  reduction → Plan D. No Plan-A spec gap.

- **Placeholder scan:** none — every code step shows full code; B–D are
  explicitly outlines, not Plan-A tasks.

- **Type consistency:** `resolveConfig(getValue, options)` and `ResolvedEnv` are
  used identically in the test (A3), the resolver (A3), and the singleton swap
  (A4); `envSchema`/`CLIENT_KEYS`/`EnvKey` names match between A2 and A3.

- **Behavior-preservation check:** offsets, secret defaults, and `AUTH_URL` logic
  are copied verbatim from `tools/env.defaults.sh`/`load.ts`; the shell-parity
  test (A3 step 1, expecting `4004`) guards that the owner still agrees with the
  untouched shell until Plan B intentionally changes it.
