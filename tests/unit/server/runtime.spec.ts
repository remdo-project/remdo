import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getMigrations } from 'better-auth/db/migration';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerRuntime } from '#server/runtime';

vi.mock('better-auth/db/migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/db/migration')>();
  return {
    ...actual,
    getMigrations: vi.fn(actual.getMigrations),
  };
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('server runtime', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('waits for auth initialization before closing the database', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-runtime-'));
    tempDirs.push(dir);
    const runtime = createServerRuntime({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      dbPath: path.join(dir, 'remdo.sqlite'),
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-runtime-'));
    tempDirs.push(dir);
    const runtime = createServerRuntime({
      allowSignup: false,
      baseURL: 'http://127.0.0.1:4000',
      dbPath: path.join(dir, 'remdo.sqlite'),
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
