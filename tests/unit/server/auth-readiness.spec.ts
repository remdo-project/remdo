import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerAuth } from '#server/auth/auth';
import { createServerDatabaseClient } from '#server/db/client';
import { createDeferred } from '../_support/deferred';
import { guardedBetterAuthLogger } from './_support/better-auth-test-logger';

const betterAuthMock = vi.hoisted(() => vi.fn());
const getMigrationsMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth', () => ({ betterAuth: betterAuthMock }));

vi.mock('better-auth/db/migration', () => ({ getMigrations: getMigrationsMock }));

vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: () => ({ id: 'oauth-provider' }),
  oauthProviderAuthServerMetadata: () => async () => new Response(),
  oauthProviderOpenIdConfigMetadata: () => async () => new Response(),
}));

function fakeBetterAuth(context: Promise<unknown>) {
  return {
    $context: context,
    api: {},
    handler: vi.fn(),
    options: {},
  };
}

function trackSettlement(promise: Promise<unknown>): () => boolean {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return () => settled;
}

describe('server auth readiness', () => {
  beforeEach(() => {
    betterAuthMock.mockReset();
    getMigrationsMock.mockReset();
    getMigrationsMock.mockResolvedValue({ runMigrations: async () => {} });
  });

  it('waits for every started auth context before reporting initialization failure', async () => {
    const pendingContext = createDeferred();
    betterAuthMock
      .mockReturnValueOnce(fakeBetterAuth(Promise.reject(new Error('context failed'))))
      .mockReturnValueOnce(fakeBetterAuth(pendingContext.promise));
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    const auth = createServerAuth({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      database,
      logger: guardedBetterAuthLogger,
      secret: 'test-better-auth-secret-0123456789',
    });

    const ready = auth.ensureReady();
    const isSettled = trackSettlement(ready);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(isSettled()).toBe(false);

    pendingContext.resolve();
    await expect(ready).rejects.toThrow('context failed');
    await database.close();
  });

  it('waits for every started auth context before reporting migration failure', async () => {
    const pendingContext = createDeferred();
    betterAuthMock
      .mockReturnValueOnce(fakeBetterAuth(Promise.resolve()))
      .mockReturnValueOnce(fakeBetterAuth(pendingContext.promise));
    getMigrationsMock.mockResolvedValueOnce({
      async runMigrations() {
        throw new Error('migration failed');
      },
    });
    const database = createServerDatabaseClient({ dbPath: ':memory:' });
    const auth = createServerAuth({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      database,
      logger: guardedBetterAuthLogger,
      secret: 'test-better-auth-secret-0123456789',
    });

    const ready = auth.ensureReady();
    const isSettled = trackSettlement(ready);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(isSettled()).toBe(false);

    pendingContext.resolve();
    await expect(ready).rejects.toThrow('migration failed');
    await database.close();
  });
});
