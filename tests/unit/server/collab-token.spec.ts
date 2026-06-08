import { describe, expect, it } from 'vitest';
import { resolveYSweetConnectionString } from '#server/collab-token';

describe('y-sweet server connection string', () => {
  it('embeds the server token into a bare connection string', () => {
    expect(resolveYSweetConnectionString({
      connectionString: 'ys://collab.example.test:1234',
      serverToken: 'fake-server-token',
    })).toBe('ys://fake-server-token@collab.example.test:1234');
  });

  it('preserves an already authenticated connection string', () => {
    expect(resolveYSweetConnectionString({
      connectionString: 'ys://existing-server-token@collab.example.test:1234',
      serverToken: 'ignored-server-token',
    })).toBe('ys://existing-server-token@collab.example.test:1234');
  });

  it('rejects bare connection strings without a server token', () => {
    expect(() => resolveYSweetConnectionString({
      connectionString: 'ys://collab.example.test:1234',
      serverToken: '',
    })).toThrow('YSWEET_SERVER_TOKEN is required');
  });
});
