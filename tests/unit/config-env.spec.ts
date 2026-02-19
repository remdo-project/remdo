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
});
