import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it, vi } from 'vitest';
import { createServerRuntime } from '#server/runtime';
import { createDeferred } from '../_support/deferred';

vi.mock('better-auth/db/migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/db/migration')>();
  return {
    ...actual,
    getMigrations: vi.fn(actual.getMigrations),
  };
});

describe('server runtime', () => {
  it('waits for auth initialization before closing the database', async () => {
    const runtime = createServerRuntime({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      dbPath: ':memory:',
      secret: 'test-better-auth-secret-0123456789',
    });
    const actualGetMigrations = vi.mocked(getMigrations).getMockImplementation()!;
    const initializationStarted = createDeferred();
    const releaseInitialization = createDeferred();
    vi.mocked(getMigrations).mockImplementationOnce(async (...args) => {
      const migrations = await actualGetMigrations(...args);
      return {
        ...migrations,
        async runMigrations() {
          initializationStarted.resolve();
          await releaseInitialization.promise;
          await migrations.runMigrations();
        },
      };
    });
    const closeDatabase = vi.spyOn(runtime.database, 'close');

    const close = runtime.close();
    await initializationStarted.promise;
    expect(closeDatabase).not.toHaveBeenCalled();

    releaseInitialization.resolve();
    await close;
    expect(closeDatabase).toHaveBeenCalledOnce();
  });

  it('closes the database after failed auth initialization', async () => {
    const runtime = createServerRuntime({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      dbPath: ':memory:',
      secret: 'test-better-auth-secret-0123456789',
    });
    const actualGetMigrations = vi.mocked(getMigrations).getMockImplementation()!;
    vi.mocked(getMigrations).mockImplementationOnce(async (...args) => {
      const migrations = await actualGetMigrations(...args);
      return {
        ...migrations,
        async runMigrations() {
          throw new Error('auth initialization failed');
        },
      };
    });
    const closeDatabase = vi.spyOn(runtime.database, 'close');

    await expect(runtime.close()).rejects.toThrow('auth initialization failed');
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
