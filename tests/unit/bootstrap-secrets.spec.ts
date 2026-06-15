import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapSecrets,
  formatExportLines,
  resolveAuthSecret,
  resolveYSweetPair,
} from '../../tools/bootstrap-secrets';

function makeTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-bootstrap-secrets-'));
}

function modeOf(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

describe('bootstrap-secrets', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDataDir(): string {
    const dir = makeTempDataDir();
    tempDirs.push(dir);
    return dir;
  }

  describe('resolveAuthSecret', () => {
    it('uses the environment variable when set and non-empty', () => {
      const dataDir = tempDataDir();
      const result = resolveAuthSecret({ dataDir, envValue: 'env-auth-secret-value' });
      expect(result).toBe('env-auth-secret-value');
      // env wins => nothing persisted.
      expect(fs.existsSync(path.join(dataDir, 'secrets', 'auth-secret'))).toBe(false);
    });

    it('loads a persisted secret file when present', () => {
      const dataDir = tempDataDir();
      const secretsDir = path.join(dataDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(path.join(secretsDir, 'auth-secret'), 'persisted-secret\n');
      const result = resolveAuthSecret({ dataDir, envValue: undefined });
      expect(result).toBe('persisted-secret');
    });

    it('generates and persists a strong secret with mode 0600 on a fresh data dir', () => {
      const dataDir = tempDataDir();
      const result = resolveAuthSecret({ dataDir, envValue: undefined });
      expect(result.length).toBeGreaterThanOrEqual(32);
      const filePath = path.join(dataDir, 'secrets', 'auth-secret');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(result);
      expect(modeOf(filePath)).toBe(0o600);
      expect(modeOf(path.join(dataDir, 'secrets'))).toBe(0o700);
    });

    it('treats an empty env value as unset and generates instead', () => {
      const dataDir = tempDataDir();
      const result = resolveAuthSecret({ dataDir, envValue: '   ' });
      expect(result.length).toBeGreaterThanOrEqual(32);
      expect(fs.existsSync(path.join(dataDir, 'secrets', 'auth-secret'))).toBe(true);
    });

    it('fails loudly when generating a fresh secret against an existing dataset (remdo.sqlite)', () => {
      const dataDir = tempDataDir();
      fs.writeFileSync(path.join(dataDir, 'remdo.sqlite'), 'pretend-db');
      expect(() => resolveAuthSecret({ dataDir, envValue: undefined })).toThrow(/persistent|dataset|regenerat/i);
    });

    it('fails loudly when generating a fresh secret against an existing collab dir', () => {
      const dataDir = tempDataDir();
      const collabDir = path.join(dataDir, 'collab');
      fs.mkdirSync(collabDir, { recursive: true });
      fs.writeFileSync(path.join(collabDir, 'doc'), 'data');
      expect(() => resolveAuthSecret({ dataDir, envValue: undefined })).toThrow(/persistent|dataset|regenerat/i);
    });

    it('does not trip the guard when only the secrets dir exists (no real dataset)', () => {
      const dataDir = tempDataDir();
      fs.mkdirSync(path.join(dataDir, 'secrets'), { recursive: true });
      const result = resolveAuthSecret({ dataDir, envValue: undefined });
      expect(result.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('resolveYSweetPair', () => {
    const fakeGenerator = () => ({ privateKey: 'fake-private-key', serverToken: 'fake-server-token' });

    it('uses both env values when both are set', () => {
      const dataDir = tempDataDir();
      const result = resolveYSweetPair({
        dataDir,
        envAuthKey: 'env-key',
        envServerToken: 'env-token',
        generate: fakeGenerator,
      });
      expect(result).toEqual({ privateKey: 'env-key', serverToken: 'env-token' });
      expect(fs.existsSync(path.join(dataDir, 'secrets', 'ysweet.json'))).toBe(false);
    });

    it('ignores env when only one of the pair is set, and generates+persists', () => {
      const dataDir = tempDataDir();
      const result = resolveYSweetPair({
        dataDir,
        envAuthKey: 'env-key',
        envServerToken: undefined,
        generate: fakeGenerator,
      });
      expect(result).toEqual({ privateKey: 'fake-private-key', serverToken: 'fake-server-token' });
      const filePath = path.join(dataDir, 'secrets', 'ysweet.json');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(modeOf(filePath)).toBe(0o600);
      expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({
        privateKey: 'fake-private-key',
        serverToken: 'fake-server-token',
      });
    });

    it('loads a persisted pair file when present', () => {
      const dataDir = tempDataDir();
      const secretsDir = path.join(dataDir, 'secrets');
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(
        path.join(secretsDir, 'ysweet.json'),
        JSON.stringify({ privateKey: 'disk-key', serverToken: 'disk-token' }),
      );
      const generate = vi.fn(fakeGenerator);
      const result = resolveYSweetPair({
        dataDir,
        envAuthKey: undefined,
        envServerToken: undefined,
        generate,
      });
      expect(result).toEqual({ privateKey: 'disk-key', serverToken: 'disk-token' });
      expect(generate).not.toHaveBeenCalled();
    });

    it('generates+persists a fresh pair when nothing is available', () => {
      const dataDir = tempDataDir();
      const result = resolveYSweetPair({
        dataDir,
        envAuthKey: undefined,
        envServerToken: undefined,
        generate: fakeGenerator,
      });
      expect(result).toEqual({ privateKey: 'fake-private-key', serverToken: 'fake-server-token' });
      expect(modeOf(path.join(dataDir, 'secrets', 'ysweet.json'))).toBe(0o600);
    });

    it('fails loudly when generating a fresh pair against an existing dataset (remdo.sqlite)', () => {
      // The Y-Sweet pair carries its own persistence guard: an existing dataset
      // with no persisted pair file means regenerating the pair would rotate the
      // collab auth token against existing data, so the resolver must refuse.
      const dataDir = tempDataDir();
      fs.writeFileSync(path.join(dataDir, 'remdo.sqlite'), 'pretend-db');
      const generate = vi.fn(fakeGenerator);
      expect(() => resolveYSweetPair({
        dataDir,
        envAuthKey: undefined,
        envServerToken: undefined,
        generate,
      })).toThrow(/persistent|dataset|regenerat/i);
      expect(generate).not.toHaveBeenCalled();
    });

    it('fails loudly when generating a fresh pair against an existing collab dir', () => {
      const dataDir = tempDataDir();
      const collabDir = path.join(dataDir, 'collab');
      fs.mkdirSync(collabDir, { recursive: true });
      fs.writeFileSync(path.join(collabDir, 'doc'), 'data');
      expect(() => resolveYSweetPair({
        dataDir,
        envAuthKey: undefined,
        envServerToken: undefined,
        generate: fakeGenerator,
      })).toThrow(/persistent|dataset|regenerat/i);
    });
  });

  describe('formatExportLines', () => {
    it('emits shell-safe export lines for all resolved secrets', () => {
      const lines = formatExportLines({
        authSecret: "s'quote",
        ysweetAuthKey: 'key',
        ysweetServerToken: 'token',
      });
      expect(lines).toContain("export AUTH_SECRET='s'\\''quote'");
      expect(lines).toContain("export YSWEET_AUTH_KEY='key'");
      expect(lines).toContain("export YSWEET_SERVER_TOKEN='token'");
    });
  });

  describe('bootstrapSecrets (integration of the pure pieces)', () => {
    it('resolves all three secrets and returns export lines', () => {
      const dataDir = tempDataDir();
      const { exportLines, resolved } = bootstrapSecrets({
        dataDir,
        env: {},
        generateYSweet: () => ({ privateKey: 'pk', serverToken: 'st' }),
      });
      expect(resolved.authSecret.length).toBeGreaterThanOrEqual(32);
      expect(resolved.ysweetAuthKey).toBe('pk');
      expect(resolved.ysweetServerToken).toBe('st');
      expect(exportLines).toContain("export YSWEET_AUTH_KEY='pk'");
    });

    it('prefers env values over generation', () => {
      const dataDir = tempDataDir();
      const { resolved } = bootstrapSecrets({
        dataDir,
        env: {
          AUTH_SECRET: 'env-auth-secret-aaaaaaaaaaaaaaaaaaaa',
          YSWEET_AUTH_KEY: 'env-key',
          YSWEET_SERVER_TOKEN: 'env-token',
        },
        generateYSweet: () => {
          throw new Error('generator must not be called when env provides the pair');
        },
      });
      expect(resolved.authSecret).toBe('env-auth-secret-aaaaaaaaaaaaaaaaaaaa');
      expect(resolved.ysweetAuthKey).toBe('env-key');
      expect(resolved.ysweetServerToken).toBe('env-token');
    });

    it('refuses to generate a fresh Y-Sweet pair when AUTH_SECRET comes from env but a dataset exists', () => {
      // Regression: an env-supplied AUTH_SECRET short-circuits the auth path, so
      // the auth guard never runs. With the pair absent from env AND disk and a
      // real dataset present, bootstrap must still refuse — otherwise it would
      // silently rotate the Y-Sweet pair against existing collab data.
      const dataDir = tempDataDir();
      fs.writeFileSync(path.join(dataDir, 'remdo.sqlite'), 'pretend-db');
      const generateYSweet = vi.fn(() => ({ privateKey: 'pk', serverToken: 'st' }));
      expect(() => bootstrapSecrets({
        dataDir,
        env: { AUTH_SECRET: 'env-auth-secret-aaaaaaaaaaaaaaaaaaaa' },
        generateYSweet,
      })).toThrow(/persistent|dataset|regenerat/i);
      expect(generateYSweet).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(dataDir, 'secrets', 'ysweet.json'))).toBe(false);
    });

    it('generates+persists the Y-Sweet pair on a true first run even with AUTH_SECRET from env', () => {
      // env-auth + empty DATA_DIR is a valid first run: no dataset exists, so the
      // guard must NOT trip and the pair is generated and persisted normally.
      const dataDir = tempDataDir();
      const { resolved } = bootstrapSecrets({
        dataDir,
        env: { AUTH_SECRET: 'env-auth-secret-aaaaaaaaaaaaaaaaaaaa' },
        generateYSweet: () => ({ privateKey: 'pk', serverToken: 'st' }),
      });
      expect(resolved.authSecret).toBe('env-auth-secret-aaaaaaaaaaaaaaaaaaaa');
      expect(resolved.ysweetAuthKey).toBe('pk');
      expect(resolved.ysweetServerToken).toBe('st');
      expect(fs.existsSync(path.join(dataDir, 'secrets', 'ysweet.json'))).toBe(true);
    });
  });
});
