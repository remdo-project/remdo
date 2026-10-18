import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { config } from '#config';
import { createAccountFixture } from '#tests-common/account-fixture';
import type { AccountFixture } from '#tests-common/account-fixture';
import { createFixtureDocument } from '#tools/fixture-document';
import { NoteUnavailableError } from '#note-sdk';
import { DocumentAccessDeniedError } from '#platform/net/collaboration-errors';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { appendChildren, readDocumentOutline } from '../../../src/headless/editor-operations';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

const execute = promisify(execFile);
const fetchHttp = globalThis.fetch.bind(globalThis);

async function credential(email: string): Promise<string> {
  const { stdout } = await execute('./tools/django.sh', ['create_delegated_token', email]);
  return `Bearer ${stdout.trim()}`;
}

async function storedContent(documentId: string): Promise<Uint8Array> {
  const response = await fetchHttp(new URL(`/internal/collaboration/documents/${documentId}/content`, resolveApiServerOrigin()), {
    headers: { 'X-Remdo-Collaboration-Secret': config.env.COLLAB_INTERNAL_SECRET, Host: new URL(config.env.APP_ORIGIN).host },
  });
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

// Read SQL independently of the open document and its collaboration cache.
async function storedOutline(documentId: string): Promise<string> {
  const stored = new Y.Doc();
  try {
    Y.applyUpdate(stored, await storedContent(documentId));
    return stored.get('root-v2', Y.XmlElement).toString();
  } finally {
    stored.destroy();
  }
}

const noteUrl = (documentId: string) => (noteId: string) =>
  new URL(`/n/${documentId}_${noteId}`, config.env.APP_ORIGIN).href;

describe('headless editor operations', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  let accounts: AccountFixture;
  let owner: string;
  let recipient: string;

  beforeEach(async () => {
    accounts = await createAccountFixture();
    [owner, recipient] = await Promise.all([credential(accounts.owner.email), credential(accounts.recipient.email)]);
  }, COLLAB_LONG_TIMEOUT_MS);

  it('reads the document or an addressed subtree at the requested depth without writing', async () => {
    const { id } = accounts.documents.privateOutline;
    const url = noteUrl(id);
    const before = await storedContent(id);

    expect(await readDocumentOutline(id, owner, url)).toBe([
      `- [note1](${url('note1')})`,
      `- [note2](${url('note2')})`,
      `  - [note3](${url('note3')})`,
    ].join('\n'));
    expect(await readDocumentOutline(id, owner, url, { noteId: 'note2', depth: 1 }))
      .toBe(`- [note2](${url('note2')}) *(1 child not shown)*`);
    expect(await storedContent(id)).toEqual(before);
  });

  it('keeps a new document’s normalized note local and unlinked', async () => {
    const id = await createFixtureDocument({ email: accounts.owner.email, title: 'Untouched' });
    const before = await storedContent(id);

    expect(await readDocumentOutline(id, owner, noteUrl(id))).toBe('- ');
    expect(await storedContent(id)).toEqual(before);
  });

  it('appends as a shared recipient at the root and under a returned note, with content already stored', async () => {
    const { id } = accounts.documents.sharedOutline;
    const [planId] = await appendChildren(id, recipient, [{ text: 'Plan', children: [{ text: 'Scope' }] }]);
    const storedPlan = await storedOutline(id);
    expect(storedPlan).toContain('Plan');
    expect(storedPlan).toContain('Scope');

    const [detailId] = await appendChildren(id, recipient, [{ text: 'Schedule' }], { noteId: planId! });
    expect(await storedOutline(id)).toContain('Schedule');

    expect(await readDocumentOutline(id, recipient, noteUrl(id), { noteId: detailId! }))
      .toBe(`- [Schedule](${noteUrl(id)(detailId!)})`);
    expect(await readDocumentOutline(id, recipient, noteUrl(id), { noteId: planId!, depth: 1 }))
      .toBe(`- [Plan](${noteUrl(id)(planId!)}) *(2 children not shown)*`);
  });

  it('preserves access and unavailable-note errors without changing private content', async () => {
    const { id } = accounts.documents.privateOutline;
    const before = await storedContent(id);

    for (const documentId of [id, 'missingdoc']) {
      await expect(readDocumentOutline(documentId, recipient, noteUrl(documentId)))
        .rejects.toBeInstanceOf(DocumentAccessDeniedError);
      await expect(appendChildren(documentId, recipient, [{ text: 'Denied' }]))
        .rejects.toBeInstanceOf(DocumentAccessDeniedError);
    }
    await expect(readDocumentOutline(id, owner, noteUrl(id), { noteId: 'missing' }))
      .rejects.toBeInstanceOf(NoteUnavailableError);
    await expect(appendChildren(id, owner, [{ text: 'Lost' }], { noteId: 'missing' }))
      .rejects.toBeInstanceOf(NoteUnavailableError);
    const cancelled = new Error('Opening cancelled');
    await expect(readDocumentOutline(id, owner, noteUrl(id), { signal: AbortSignal.abort(cancelled) }))
      .rejects.toBe(cancelled);
    await expect(appendChildren(id, owner, [{ text: 'Cancelled' }], { signal: AbortSignal.abort(cancelled) }))
      .rejects.toBe(cancelled);
    expect(await storedContent(id)).toEqual(before);
  });
});
