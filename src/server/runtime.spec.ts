import { getMigrations } from 'better-auth/db/migration';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authModule from '#server/auth/auth';
import * as databaseModule from '#server/db/client';
import { createServerRuntime } from '#server/runtime';
import { createDeferred } from '../../tests/unit/_support/deferred';

vi.mock('better-auth/db/migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/db/migration')>();
  return { ...actual, getMigrations: vi.fn(actual.getMigrations) };
});

const options = {
  allowSignup: false,
  baseURL: 'http://127.0.0.1:4000',
  dbPath: ':memory:',
  secret: 'test-better-auth-secret-0123456789',
};

afterEach(() => vi.restoreAllMocks());

describe('server runtime', () => {
  it('does not publish a runtime until auth migrations finish', async () => {
    const actualGetMigrations = vi.mocked(getMigrations).getMockImplementation()!;
    const started = createDeferred();
    const release = createDeferred();
    vi.mocked(getMigrations).mockImplementationOnce(async (...args) => {
      const migrations = await actualGetMigrations(...args);
      return {
        ...migrations,
        async runMigrations() {
          started.resolve();
          await release.promise;
          await migrations.runMigrations();
        },
      };
    });
    let published = false;
    const pending = createServerRuntime(options).then((runtime) => {
      published = true;
      return runtime;
    });
    await started.promise;
    expect(published).toBe(false);
    release.resolve();
    const runtime = await pending;
    try {
      const response = await runtime.app.request('/api/health');
      expect(response.status).toBe(200);
    } finally {
      await runtime.close();
    }
  });

  it.each([false, true])('closes the database after failed initialization (close fails: %s)', async (closeFails) => {
    const database = databaseModule.createServerDatabaseClient({ dbPath: ':memory:' });
    vi.spyOn(databaseModule, 'createServerDatabaseClient').mockReturnValueOnce(database);
    const close = vi.spyOn(database, 'close');
    if (closeFails) {
      close.mockRejectedValueOnce(new Error('database close failed'));
    }
    vi.mocked(getMigrations).mockRejectedValueOnce(new Error('auth initialization failed'));
    try {
      await expect(createServerRuntime(options)).rejects.toThrow('auth initialization failed');
      expect(close).toHaveBeenCalledOnce();
      if (!closeFails) {
        expect(database.sqlite.open).toBe(false);
      }
    } finally {
      if (database.sqlite.open) {
        await database.close();
      }
    }
  });

  it('drains a pending auth rebuild before closing the database', async () => {
    const createAuth = vi.spyOn(authModule, 'createSwappableServerAuth');
    const runtime = await createServerRuntime(options);
    const swappable = await createAuth.mock.results[0]!.value;
    const actualGetMigrations = vi.mocked(getMigrations).getMockImplementation()!;
    const started = createDeferred();
    const release = createDeferred();
    vi.mocked(getMigrations).mockImplementationOnce(async (...args) => {
      const migrations = await actualGetMigrations(...args);
      return {
        ...migrations,
        async runMigrations() {
          started.resolve();
          await release.promise;
          await migrations.runMigrations();
        },
      };
    });
    const rebuild = swappable.rebuild();
    await started.promise;
    const close = runtime.close();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(runtime.database.sqlite.open).toBe(true);
    release.resolve();
    await Promise.all([rebuild, close]);
    expect(runtime.database.sqlite.open).toBe(false);
  });

});
