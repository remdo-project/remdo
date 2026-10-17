import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it, onTestFinished } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { config } from '#config';
import { asCollaborationProviderEvents, createProviderFactory, waitForSync } from '#collaboration/runtime';
import { createTestAuthAccount, TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { resolveApiServerOrigin, resolveCollabServerOrigin, resolveMcpServerOrigin } from '#platform/net/origins';
import { ensureCollabTestUser } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const execute = promisify(execFile);
const fetchHttp = globalThis.fetch.bind(globalThis);
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

async function read(client: Client, target: string, depth?: number): Promise<string> {
  const result = await client.callTool({ name: 'read_document', arguments: { target, ...(depth === undefined ? {} : { depth }) } });
  expect(result.isError).toBeFalsy();
  return (result.content as Array<{ text: string }>)[0]!.text;
}

// Preserve distinct identities while replacing random note IDs in each read.
function stableNoteIds(outline: string): string {
  const ids = new Map<string, string>();
  return outline.replaceAll(/(\/n\/[A-Za-z0-9]+_)[A-Za-z0-9]+/g, (address: string, prefix: string) => {
    const id = ids.get(address) ?? `NOTE${ids.size + 1}`;
    ids.set(address, id);
    return `${prefix}${id}`;
  });
}

async function storedText(documentId: string): Promise<string> {
  const response = await fetchHttp(new URL(`/internal/collaboration/documents/${documentId}/content`, resolveApiServerOrigin()), {
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

describe('mcp server', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  it('challenges a request without a delegated access token', async () => {
    const response = await fetchHttp(endpoint, { method: 'POST' });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate'))
      .toContain(`resource_metadata="${  new URL('/.well-known/oauth-protected-resource/mcp', config.env.APP_ORIGIN).href}`);
  });

  it('lists an empty inventory and then the exact documents without changing them', async () => {
    const account = createTestAuthAccount('mcp-contract-inventory');
    const token = await delegatedToken(account.email);
    const headers = { Authorization: `Bearer ${token}`, Host: new URL(config.env.APP_ORIGIN).host };
    const documentsUrl = new URL('/api/documents', resolveApiServerOrigin());
    const initial = await fetchHttp(documentsUrl, { headers });
    expect(initial.status).toBe(200);
    for (const { id } of await initial.json() as Array<{ id: string }>) {
      const removed = await fetchHttp(new URL(`/api/documents/${id}`, documentsUrl), { method: 'DELETE', headers });
      expect(removed.status).toBe(204);
    }
    const client = await connect(token);
    expect(await call(client, 'list_documents')).toEqual({ isError: false, value: [] });
    expect(await (await fetchHttp(documentsUrl, { headers })).json()).toEqual([]);

    const { documentId } = (await call(client, 'create_document', { title: 'Inventory' })).value as { documentId: string };
    const second = (await call(client, 'create_document', { title: 'Second' })).value as { documentId: string };
    await call(client, 'append_children', { parent: documentId, notes: [{ text: 'Keep this content' }] });
    const before = await storedText(documentId);
    const expected = {
      isError: false,
      value: [
        { documentId, title: 'Inventory', url: noteUrl(documentId) },
        { documentId: second.documentId, title: 'Second', url: noteUrl(second.documentId) },
      ],
    };
    expect(await call(client, 'list_documents')).toEqual(expected);
    expect(await call(client, 'list_documents')).toEqual(expected);
    expect(await storedText(documentId)).toBe(before);
    expect(await storedText(second.documentId)).toBe('');
  });

  it('creates a document, appends an outline, and has it stored when the tool returns', async () => {
    const client = await connect(await delegatedToken());
    const created = await call(client, 'create_document', { title: 'Conversation' });
    const { documentId } = created.value as { documentId: string };
    expect(created).toEqual({ isError: false, value: { documentId, title: 'Conversation', url: noteUrl(documentId) } });
    const appended = await call(client, 'append_children', {
      parent: documentId,
      notes: [{ text: 'Plan', children: [{ text: 'Scope' }, { text: 'Schedule' }] }],
    });
    expect(appended).toMatchObject({ isError: false });
    const [plan] = appended.value as Array<{ noteAddress: string }>;
    expect(appended.value).toEqual([{ noteAddress: plan!.noteAddress, url: noteUrl(plan!.noteAddress) }]);
    expect(plan!.noteAddress.startsWith(`${documentId}_`)).toBe(true);

    const stored = await storedText(documentId);
    expect(stored).toContain('Plan');
    expect(stored).toContain('Scope');
    expect(stored).toContain('Schedule');

    const outline = await read(client, documentId);
    expect(outline).toContain(`[Plan](${noteUrl(plan!.noteAddress)})`);
    const url = (index: number) => noteUrl(`${documentId}_NOTE${index}`);
    expect(stableNoteIds(outline)).toBe(
      `Document: ${noteUrl(documentId)}\n\n- [Plan](${url(1)})\n`
      + `  - [Scope](${url(2)})\n  - [Schedule](${url(3)})`,
    );
    const scopeAddress = /\[Scope\]\([^)]*\/([^/)]+)\)/.exec(outline)![1]!;
    const scheduleAddress = /\[Schedule\]\([^)]*\/([^/)]+)\)/.exec(outline)![1]!;
    expect(await read(client, scopeAddress)).toBe(`Document: ${noteUrl(documentId)}\n\n- [Scope](${noteUrl(scopeAddress)})`);
    expect(await read(client, scheduleAddress)).toBe(`Document: ${noteUrl(documentId)}\n\n- [Schedule](${noteUrl(scheduleAddress)})`);
    expect(await storedText(documentId)).toBe(stored);

    const listed = (await call(client, 'list_documents')).value as Array<{ documentId: string }>;
    expect(listed).toContainEqual({ documentId, title: 'Conversation', url: noteUrl(documentId) });
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
    expect(await read(client, documentId)).toBe(`Document: ${noteUrl(documentId)}\n\n- `);
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
    const stored = await storedText(documentId);
    const url = (index: number) => noteUrl(`${documentId}_NOTE${index}`);

    expect(stableNoteIds(await read(client, topic!.noteAddress))).toBe(
      `Document: ${noteUrl(documentId)}\n\n- [Topic](${url(1)})\n  - [Detail](${url(2)})\n    - [Fine print](${url(3)})`,
    );
    expect(stableNoteIds(await read(client, topic!.noteAddress, 2))).toBe(
      `Document: ${noteUrl(documentId)}\n\n- [Topic](${url(1)})\n  - [Detail](${url(2)}) *(1 child not shown)*`,
    );
    expect(stableNoteIds(await read(client, documentId, 1))).toBe(
      `Document: ${noteUrl(documentId)}\n\n- [Other](${url(1)})\n- [Topic](${url(2)}) *(1 child not shown)*`,
    );
    const missingNote = await client.callTool({ name: 'read_document', arguments: { target: `${documentId}_nosuchnote` } });
    expect(missingNote.isError).toBe(true);
    expect(await storedText(documentId)).toBe(stored);
  });

  it('renames only the addressed document and preserves its ID, URL, and content', async () => {
    const client = await connect(await delegatedToken());
    const duplicate = (await call(client, 'create_document', { title: 'Draft' })).value as { documentId: string };
    const { documentId } = (await call(client, 'create_document', { title: 'Draft' })).value as { documentId: string };
    const existingFinal = (await call(client, 'create_document', { title: 'Final' })).value as { documentId: string };
    await call(client, 'append_children', { parent: documentId, notes: [{ text: 'Keep' }] });
    const stored = await storedText(documentId);

    const renamed = await call(client, 'rename_document', { documentId, title: 'Final' });
    expect(renamed).toEqual({ isError: false, value: { documentId, title: 'Final', url: noteUrl(documentId) } });

    const ids = new Set([duplicate.documentId, documentId, existingFinal.documentId]);
    const listed = (await call(client, 'list_documents')).value as Array<{ documentId: string }>;
    expect(listed.filter((document) => ids.has(document.documentId))).toEqual([
      { documentId: duplicate.documentId, title: 'Draft', url: noteUrl(duplicate.documentId) },
      { documentId, title: 'Final', url: noteUrl(documentId) },
      { documentId: existingFinal.documentId, title: 'Final', url: noteUrl(existingFinal.documentId) },
    ]);
    expect(await storedText(documentId)).toBe(stored);
    expect(await storedText(duplicate.documentId)).toBe('');
    expect(await storedText(existingFinal.documentId)).toBe('');
  });

  it('converts the list holding a note\'s children and refuses a note without children', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Checklist' })).value as { documentId: string };
    const appended = await call(client, 'append_children', {
      parent: documentId,
      notes: [
        { text: 'Trip', children: [{ text: 'Passport', children: [{ text: 'Renewal' }] }, { text: 'Tickets' }] },
        { text: 'Other', children: [{ text: 'Unchanged' }] },
        { text: 'Visa' },
      ],
    });
    const [trip, , visa] = appended.value as Array<{ noteAddress: string }>;

    const converted = await call(client, 'set_child_list_type', { noteAddress: trip!.noteAddress, listType: 'check' });
    expect(converted).toEqual({
      isError: false,
      value: { noteAddress: trip!.noteAddress, listType: 'check', url: noteUrl(trip!.noteAddress) },
    });

    const text = await read(client, documentId);
    const url = (index: number) => noteUrl(`${documentId}_NOTE${index}`);
    expect(stableNoteIds(text)).toBe(
      `Document: ${noteUrl(documentId)}\n\n- [Trip](${url(1)})\n`
      + `  - [ ] [Passport](${url(2)})\n    - [Renewal](${url(3)})\n  - [ ] [Tickets](${url(4)})\n`
      + `- [Other](${url(5)})\n  - [Unchanged](${url(6)})\n- [Visa](${url(7)})`,
    );

    const passportAddress = /\[Passport\]\([^)]*\/([^/)]+)\)/.exec(text)![1]!;
    expect(stableNoteIds(await read(client, passportAddress))).toBe(
      `Document: ${noteUrl(documentId)}\n\n- [ ] [Passport](${url(1)})\n  - [Renewal](${url(2)})`,
    );

    const stored = await storedText(documentId);
    const refused = await call(client, 'set_child_list_type', { noteAddress: visa!.noteAddress, listType: 'number' });
    expect(refused).toEqual({ isError: true, value: 'INVALID_ARGUMENT: Only a note with children has a child list.' });
    expect(await storedText(documentId)).toBe(stored);
  });

  it('reports missing and unshared documents identically without exposing or changing the private document', async () => {
    const owner = await connect(await delegatedToken('mcp-owner@example.test'));
    const { documentId: privateId } = (await call(owner, 'create_document', { title: 'Private' })).value as { documentId: string };
    const appended = await call(owner, 'append_children', {
      parent: privateId, notes: [{ text: 'Private note', children: [{ text: 'Private child' }] }],
    });
    const [privateNote] = appended.value as Array<{ noteAddress: string }>;
    const before = await storedText(privateId);
    const original = await read(owner, privateId);
    const other = await connect(await delegatedToken());
    const outcomes = async (documentId: string, noteAddress = `${documentId}_note`) => [
      await call(other, 'read_document', { target: documentId }),
      await call(other, 'append_children', { parent: documentId, notes: [{ text: 'Lost' }] }),
      await call(other, 'set_child_list_type', { noteAddress, listType: 'check' }),
      await call(other, 'rename_document', { documentId, title: 'Lost' }),
    ];

    const notFound = Array.from({ length: 4 }, () => ({
      isError: true,
      value: 'NOT_FOUND: The document is not available. Check list_documents for the documents the user can access.',
    }));

    expect(await outcomes('missingdoc')).toEqual(notFound);
    expect(await outcomes(privateId, privateNote!.noteAddress)).toEqual(notFound);
    expect(await storedText(privateId)).toBe(before);
    expect(await read(owner, privateId)).toBe(original);
    const listed = (await call(other, 'list_documents')).value as Array<{ documentId: string }>;
    expect(listed.map(({ documentId }) => documentId)).not.toContain(privateId);
    const ownerDocuments = (await call(owner, 'list_documents')).value as Array<{ documentId: string }>;
    expect(ownerDocuments).toContainEqual({ documentId: privateId, title: 'Private', url: noteUrl(privateId) });
  });

  it('refuses a missing note in a new document without calling the write unconfirmed', async () => {
    const client = await connect(await delegatedToken());
    const { documentId } = (await call(client, 'create_document', { title: 'Empty' })).value as { documentId: string };

    const appended = await call(client, 'append_children', {
      parent: `${documentId}_missingnote`, notes: [{ text: 'Lost' }],
    });

    expect(appended).toEqual({
      isError: true,
      value: 'NOT_FOUND: Note "missingnote" is not available. Read the document for its current notes.',
    });
  });
});
