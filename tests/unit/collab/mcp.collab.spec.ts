import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, onTestFinished } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { config } from '#config';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '#collaboration/runtime';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { resolveApiServerOrigin, resolveCollabServerOrigin, resolveMcpServerOrigin } from '#platform/net/origins';
import { ensureCollabTestUser } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const execute = promisify(execFile);
const endpoint = new URL('/mcp', resolveMcpServerOrigin());

async function delegatedToken(email: string = TEST_AUTH_ACCOUNT.email): Promise<string> {
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

const noteUrl = (address: string) => new URL(`/n/${address}`, config.env.APP_ORIGIN).href;

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

// Joins the document as another session whose cursor sits in the outline, as
// an open editor's does.
async function joinWithCursor(documentId: string, token: string): Promise<void> {
  class AuthorizedWebSocket extends WebSocket {
    constructor(url: string | URL) {
      super(url, { headers: { Authorization: `Bearer ${token}` } });
    }
  }
  const factory = createProviderFactory({
    visibleOrigin: resolveCollabServerOrigin(),
    WebSocketPolyfill: AuthorizedWebSocket as unknown as typeof globalThis.WebSocket,
  });
  const { provider, doc } = factory(documentId, new Map());
  onTestFinished(() => {
    provider.destroy();
    doc.destroy();
  });
  await provider.connect();
  await waitForSync(asCollaborationProviderEvents(provider));
  const position = Y.createRelativePositionFromTypeIndex(doc.get('root-v2', Y.XmlElement), 0);
  provider.awareness.setLocalState({ name: 'Peer', color: '#228be6', focusing: true, anchorPos: position, focusPos: position, awarenessData: {} });
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
    expect(tools.map(({ name }) => name).sort()).toEqual([
      'append_children',
      'create_document',
      'list_documents',
      'read_document',
      'rename_document',
      'set_child_list_type',
    ]);

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

    const read = await client.callTool({ name: 'read_document', arguments: { target: created.documentId } });
    const [outline] = read.content as Array<{ text: string }>;
    expect(outline!.text.startsWith(`Document: ${noteUrl(created.documentId)}\n\n- [Summary](${noteUrl(summary!.noteAddress)})`))
      .toBe(true);
    expect(outline!.text).toMatch(/\n {2}- \[Decision\]\(/);

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

  it('appends while another session has its cursor in the document', async () => {
    const token = await delegatedToken();
    const client = await connect(token);
    const { documentId } = (await call(client, 'create_document', { title: 'Watched' })).value as { documentId: string };
    await call(client, 'append_children', { parent: documentId, notes: [{ text: 'Existing' }] });
    await joinWithCursor(documentId, token);

    const appended = await call(client, 'append_children', { parent: documentId, notes: [{ text: 'Added' }] });
    expect(appended).toMatchObject({ isError: false });
    expect(await storedText(documentId)).toContain('Added');
  });

  it('reads a new document without storing or linking its generated note', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Untouched' })).value as { documentId: string };
    const read = await client.callTool({ name: 'read_document', arguments: { target: documentId } });
    expect(read.isError).toBeFalsy();
    const [outline] = read.content as Array<{ text: string }>;
    expect(outline!.text).toBe(`Document: ${noteUrl(documentId)}\n\n- `);
    expect(await storedText(documentId)).toBe('');
  });

  it('reads one note with its descendants and cuts a read off at the depth limit', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Depth' })).value as { documentId: string };
    const appended = await call(client, 'append_children', {
      parent: documentId,
      notes: [{ text: 'Other' }, { text: 'Topic', children: [{ text: 'Detail', children: [{ text: 'Fine print' }] }] }],
    });
    const [, topic] = appended.value as Array<{ noteAddress: string }>;
    const read = async (args: Record<string, unknown>) => {
      const response = await client.callTool({ name: 'read_document', arguments: args });
      return (response.content as Array<{ text: string }>)[0]!.text.split('\n\n')[1];
    };

    expect(await read({ target: topic!.noteAddress })).toMatch(
      /^- \[Topic\]\([^)]+\)\n {2}- \[Detail\]\([^)]+\)\n {4}- \[Fine print\]\([^)]+\)$/,
    );
    expect(await read({ target: topic!.noteAddress, depth: 2 })).toMatch(
      /^- \[Topic\]\([^)]+\)\n {2}- \[Detail\]\([^)]+\) \*\(1 child not shown\)\*$/,
    );
    expect(await read({ target: documentId, depth: 1 })).toMatch(
      /^- \[Other\]\([^)]+\)\n- \[Topic\]\([^)]+\) \*\(1 child not shown\)\*$/,
    );
    const missingNote = await client.callTool({ name: 'read_document', arguments: { target: `${documentId}_nosuchnote` } });
    expect(missingNote.isError).toBe(true);
  });

  it('renames a document', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Draft' })).value as { documentId: string };

    const renamed = await call(client, 'rename_document', { documentId, title: 'Final' });
    expect(renamed.value).toEqual({ documentId, title: 'Final', url: noteUrl(documentId) });

    const listed = (await call(client, 'list_documents')).value as Array<{ documentId: string; title: string }>;
    expect(listed.find((document) => document.documentId === documentId)?.title).toBe('Final');
  });

  it('converts the list holding a note\'s children and refuses a note without children', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Checklist' })).value as { documentId: string };
    const appended = await call(client, 'append_children', {
      parent: documentId,
      notes: [{ text: 'Trip', children: [{ text: 'Passport' }] }, { text: 'Visa' }],
    });
    const [trip, visa] = appended.value as Array<{ noteAddress: string }>;

    const converted = await call(client, 'set_child_list_type', { noteAddress: trip!.noteAddress, listType: 'check' });
    expect(converted).toMatchObject({ isError: false, value: { noteAddress: trip!.noteAddress, listType: 'check' } });

    const read = await client.callTool({ name: 'read_document', arguments: { target: documentId } });
    expect((read.content as Array<{ text: string }>)[0]!.text).toMatch(/\n {2}- \[ \] \[Passport\]\(/);

    const refused = await call(client, 'set_child_list_type', { noteAddress: visa!.noteAddress, listType: 'number' });
    expect(refused).toEqual({ isError: true, value: 'Only a note with children has a child list.' });
  });

  it('reports an unavailable document as a tool error', async () => {
    const client = await connect(await delegatedToken());
    const appended = await call(client, 'append_children', { parent: 'missingdoc', notes: [{ text: 'Lost' }] });
    expect(appended.isError).toBe(true);
    const read = await client.callTool({ name: 'read_document', arguments: { target: 'missingdoc' } });
    expect(read.isError).toBe(true);
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
