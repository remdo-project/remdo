import { describe, expect, it } from 'vitest';
import { loadEnv } from '#config/_internal/env/load';

describe('config env loading', () => {
  it('reads DATA_DIR from env inputs', () => {
    const requested: string[] = [];
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      DATA_DIR: '/repo/data',
    };
    const loaded = loadEnv((key) => {
      requested.push(key);
      return values[key];
    });

    expect(loaded.server.DATA_DIR).toBe('/repo/data');
    expect(requested).toContain('DATA_DIR');
  });

  it('requires NODE_ENV', () => {
    expect(() => loadEnv(() => '')).toThrow(
      'NODE_ENV is required; run via tools/env.sh.',
    );
  });

  it('keeps server-only collaboration env out of client config', () => {
    const values: Partial<Record<
      'NODE_ENV' | 'REMDO_API_PORT' | 'YSWEET_CONNECTION_STRING',
      string
    >> = {
      NODE_ENV: 'test',
      REMDO_API_PORT: '4011',
      YSWEET_CONNECTION_STRING: 'ys://127.0.0.1:4004',
    };
    const loaded = loadEnv((key) => {
      return values[key as keyof typeof values];
    });

    expect(loaded.server.REMDO_API_PORT).toBe(4011);
    expect(loaded.server.YSWEET_CONNECTION_STRING).toBe('ys://127.0.0.1:4004');
    expect(loaded.client).not.toHaveProperty('REMDO_API_PORT');
    expect(loaded.client).not.toHaveProperty('YSWEET_CONNECTION_STRING');
  });
});
