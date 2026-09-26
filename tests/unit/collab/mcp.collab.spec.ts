import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, onTestFinished } from 'vitest';
import * as Y from 'yjs';
import { config } from '#config';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { resolveApiServerOrigin, resolveMcpServerOrigin } from '#platform/net/origins';
import { ensureCollabTestUser } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const execute = promisify(execFile);
const endpoint = new URL('/mcp', resolveMcpServerOrigin());

async function delegatedToken(email = TEST_AUTH_ACCOUNT.email): Promise<string> {
  await ensureCollabTestUser();
  const { stdout } = await execute('./tools/django.sh', ['create_delegated_token', email]);
  return stdout.trim();
}

async function connect(token: string) {
  const client = new Client({ name: 'mcp-test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  onTestFinished(() => client.close());
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const response = await client.callTool({ name, arguments: args });
  const [content] = response.content as Array<{ text: string }>;
  return { isError: response.isError === true, value: response.isError ? content!.text : JSON.parse(content!.text) as unknown };
}

async function storedText(documentId: string): Promise<string> {
  const response = await fetch(new URL(`/internal/collaboration/documents/${documentId}/content`, resolveApiServerOrigin()), {
    headers: { 'X-Remdo-Collaboration-Secret': config.env.COLLAB_INTERNAL_SECRET, Host: new URL(config.env.APP_ORIGIN).host },
  });
  const state = new Uint8Array(await response.arrayBuffer());
  if (state.length === 0) return '';
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  const text = document.get('root-v2', Y.XmlElement).toString();
  document.destroy();
  return text;
}

describe('mCP server', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('challenges a request without a delegated access token', async () => {
    const response = await fetch(endpoint, { method: 'POST' });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate'))
      .toContain(`resource_metadata="${  new URL('/.well-known/oauth-protected-resource/mcp', config.env.APP_ORIGIN).href}`);
  });

  it('creates a document, appends an outline, and has it stored when the tool returns', async () => {
    const client = await connect(await delegatedToken());
    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name).sort()).toEqual(['append_children', 'create_document', 'list_documents']);

    const created = (await call(client, 'create_document', { title: 'Conversation' })).value as { documentId: string };
    const appended = await call(client, 'append_children', {
      parent: created.documentId,
      notes: [{ text: 'Summary', children: [{ text: 'Decision' }] }],
    });
    expect(appended).toMatchObject({ isError: false });
    const [summary] = appended.value as Array<{ noteAddress: string }>;
    expect(summary!.noteAddress.startsWith(`${created.documentId}_`)).toBe(true);

    const stored = await storedText(created.documentId);
    expect(stored).toContain('Summary');
    expect(stored).toContain('Decision');

    const listed = (await call(client, 'list_documents')).value as Array<{ documentId: string }>;
    expect(listed.map(({ documentId }) => documentId)).toContain(created.documentId);
  });

  it('appends again to a document that already has notes', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Twice' })).value as { documentId: string };
    const first = await call(client, 'append_children', { parent: documentId, notes: [{ text: 'First' }] });
    const [note] = first.value as Array<{ noteAddress: string }>;
    const second = await call(client, 'append_children', { parent: note!.noteAddress, notes: [{ text: 'Second' }] });
    expect(second).toMatchObject({ isError: false });
    expect(await storedText(documentId)).toContain('Second');
  });

  it('reports an unavailable document as a tool error', async () => {
    const client = await connect(await delegatedToken());
    const appended = await call(client, 'append_children', { parent: 'missingdoc', notes: [{ text: 'Lost' }] });
    expect(appended.isError).toBe(true);
    const malformed = await call(client, 'append_children', { parent: 'missingdoc_', notes: [{ text: 'Lost' }] });
    expect(malformed.isError).toBe(true);
  });

  it("refuses to write to another user's document", async () => {
    const owner = await connect(await delegatedToken('mcp-owner@example.test'));
    const { documentId } = (await call(owner, 'create_document', { title: 'Private' })).value as { documentId: string };
    const other = await connect(await delegatedToken());
    const appended = await call(other, 'append_children', { parent: documentId, notes: [{ text: 'Intrusion' }] });
    expect(appended.isError).toBe(true);
    expect(await storedText(documentId)).not.toContain('Intrusion');
  });
});
