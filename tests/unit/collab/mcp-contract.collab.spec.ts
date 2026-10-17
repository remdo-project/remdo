import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '#config';
import reference from '#fixtures/mcp/compatibility.json';
import { resolveApiServerOrigin, resolveMcpServerOrigin } from '#platform/net/origins';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const execute = promisify(execFile);
// Bypass the editor fixture's browser-session fetch wrapper: these requests must
// authenticate only with the supplied MCP credential.
const fetchHttp = globalThis.fetch.bind(globalThis);
const endpoint = new URL('/mcp', resolveMcpServerOrigin());
const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', config.env.APP_ORIGIN).href;
const expected = JSON.parse(
  JSON.stringify(reference.results).replaceAll(reference.appOrigin, config.env.APP_ORIGIN),
) as typeof reference.results;
let credentials: Record<'valid' | 'wrong_resource' | 'missing_scope' | 'expired' | 'revoked' | 'refresh', string>;

function post(body: unknown, authorization?: string) {
  return fetchHttp(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify(body),
  });
}

async function rpc(method: string, params: unknown) {
  const response = await post({ jsonrpc: '2.0', id: 7, method, params }, `Bearer ${credentials.valid}`);
  expect(response.status).toBe(200);
  // Temporary compatibility freeze (stateless transport). Retirement: docs/todo.md#temporary-mcp-compatibility-guards.
  expect(response.headers.get('mcp-session-id')).toBeNull();
  const type = response.headers.get('content-type')!;
  const text = await response.text();
  // Streamable HTTP permits a JSON response or an SSE response. Inspect the raw
  // message so client-SDK parsing cannot discard extension fields such as OAuth.
  if (type.startsWith('application/json')) return JSON.parse(text) as unknown;
  expect(type).toContain('text/event-stream');
  const messages = text.split(/\r?\n/).filter(line => line.startsWith('data: '));
  expect(messages).toHaveLength(1);
  return JSON.parse(messages[0]!.slice(6)) as unknown;
}

describe('mcp compatibility over HTTP', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  beforeAll(async () => {
    const { stdout } = await execute('./tools/django.sh', [
      'shell', '--no-imports', '-c',
      'import runpy; runpy.run_path("tests/unit/collab/_support/mcp-token-fixtures.py")',
    ]);
    credentials = JSON.parse(stdout) as typeof credentials;
  });

  it('preserves initialization, instructions and complete tool descriptors', async () => {
    // Temporary compatibility freeze (descriptors). Retirement: docs/todo.md#temporary-mcp-compatibility-guards.
    expect(await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'compatibility-test', version: '1' },
    })).toEqual({ jsonrpc: '2.0', id: 7, result: expected.initialize });
    expect(await rpc('tools/list', {})).toEqual({ jsonrpc: '2.0', id: 7, result: expected['tools/list'] });
  });

  it('accepts initialized notifications without requiring a session identifier', async () => {
    const response = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, `Bearer ${credentials.valid}`);
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    // Temporary compatibility freeze (stateless transport). Retirement: docs/todo.md#temporary-mcp-compatibility-guards.
    expect(response.headers.get('mcp-session-id')).toBeNull();
  });

  it.each([undefined, 'Basic synthetic'])('challenges missing bearer credentials (%s)', async (authorization) => {
    const response = await post({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} }, authorization);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${metadataUrl}"`);
    expect(await response.text()).toBe('');
  });

  it.each(['wrong_resource', 'missing_scope', 'expired', 'revoked', 'refresh'] as const)(
    'rejects a %s credential at the MCP endpoint', async (kind) => {
      const authorization = `Bearer ${credentials[kind]}`;
      if (kind === 'wrong_resource' || kind === 'missing_scope') {
        // These are valid delegated API credentials, but not valid MCP credentials.
        const response = await fetchHttp(new URL('/api/documents', resolveApiServerOrigin()), {
          headers: { Authorization: authorization, Host: new URL(config.env.APP_ORIGIN).host },
        });
        expect(response.status).toBe(200);
        await response.arrayBuffer();
      }
      const response = await post({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} }, authorization);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${metadataUrl}", error="invalid_token"`);
      expect(await response.text()).toBe('');
    },
  );

  it('preserves the public tool-error envelope for malformed document addresses', async () => {
    expect(await rpc('tools/call', {
      name: 'rename_document', arguments: { documentId: 'bad/id', title: 'Unchanged' },
    })).toEqual({
      jsonrpc: '2.0', id: 7,
      result: {
        isError: true,
        // Temporary compatibility freeze (error wording). Retirement: docs/todo.md#temporary-mcp-compatibility-guards.
        content: [{ type: 'text', text: 'INVALID_ARGUMENT: The documentId is not valid.' }],
      },
    });
  });
});
