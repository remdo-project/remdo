import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerAuth } from '#server/auth/auth';
import { createServerDatabaseClient } from '#server/db/client';

const betterAuthMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth', () => ({ betterAuth: betterAuthMock }));

vi.mock('better-auth/db/migration', () => ({
  getMigrations: async () => ({ runMigrations: async () => {} }),
}));

vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: () => ({ id: 'oauth-provider' }),
  oauthProviderAuthServerMetadata: () => async () => new Response(),
  oauthProviderOpenIdConfigMetadata: () => async () => new Response(),
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function fakeBetterAuth(context: Promise<unknown>) {
  return {
    $context: context,
    api: {},
    handler: vi.fn(),
    options: {},
  };
}

describe('server auth readiness', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    betterAuthMock.mockReset();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('waits for every started auth context before reporting initialization failure', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-auth-readiness-'));
    tempDirs.push(dir);
    const pendingContext = createDeferred();
    betterAuthMock
      .mockReturnValueOnce(fakeBetterAuth(Promise.reject(new Error('context failed'))))
      .mockReturnValueOnce(fakeBetterAuth(pendingContext.promise));
    const database = createServerDatabaseClient({ dbPath: path.join(dir, 'remdo.sqlite') });
    const auth = createServerAuth({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      database,
      secret: 'test-better-auth-secret-0123456789',
    });

    let settled = false;
    const ready = auth.ensureReady();
    void ready.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(settled).toBe(false);

    pendingContext.resolve();
    await expect(ready).rejects.toThrow('context failed');
    await database.close();
  });
});
