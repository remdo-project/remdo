import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('docker Caddy gateway config', () => {
  const caddyfile = fs.readFileSync('docker/Caddyfile', 'utf8');

  it('ties public health readiness to the API process', () => {
    expect(caddyfile).toContain('handle /health {');
    expect(caddyfile).toContain('rewrite * /api/health');
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:{env.API_SERVER_PORT}');
    expect(caddyfile).not.toContain('respond 200');
  });

  it('routes bare API-backed gateway paths away from the SPA fallback', () => {
    expect(caddyfile).toContain('@api path /api /api/*');
    expect(caddyfile).toContain('@well_known path /.well-known /.well-known/*');
    expect(caddyfile).toContain('@collab path /d /d/*');
    expect(caddyfile).toContain('@app_routes not path /api /api/* /.well-known /.well-known/* /d /d/* /doc*');
  });
});
