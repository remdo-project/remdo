import { request } from 'playwright';
import { expect, it } from 'vitest';
import { createAccountFixture } from '#tests-common/account-fixture';
import { authenticateDjangoTestUser } from '#tests-common/django-auth';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { SUBPROCESS_TEST_TIMEOUT_MS } from '../_support/timeouts';
import type { UserDocument } from '#domain/documents/user-data';

it('recreates known account data without carrying over edits or added grants', async () => {
  const first = await createAccountFixture();
  const writer = await request.newContext({ baseURL: resolveApiServerOrigin() });
  try {
    const csrfToken = await authenticateDjangoTestUser(writer, resolveApiServerOrigin(), first.owner);
    const headers = { 'X-CSRFToken': csrfToken };
    await writer.put(`/api/documents/${first.documents.privateOutline.id}`, {
      headers, data: { title: 'Changed in one test' }, failOnStatusCode: true,
    });
    await writer.post(`/api/documents/${first.documents.privateOutline.id}/access`, {
      headers, data: { email: first.recipient.email }, failOnStatusCode: true,
    });
  } finally {
    await writer.dispose();
  }

  const next = await createAccountFixture();
  const client = await request.newContext({ baseURL: resolveApiServerOrigin() });
  const reader = await request.newContext({ baseURL: resolveApiServerOrigin() });
  try {
    await authenticateDjangoTestUser(client, resolveApiServerOrigin(), next.owner);
    const response = await client.get('/api/documents', { failOnStatusCode: true });
    const documents = await response.json() as UserDocument[];
    expect(documents.map(document => document.title).sort()).toEqual(['New Document', 'Private outline', 'Shared outline']);
    expect(documents.map(document => document.id)).not.toContain(first.documents.privateOutline.id);
    expect(documents.find(document => document.id === next.documents.privateOutline.id)!.access).toEqual([]);
    expect(documents.find(document => document.id === next.documents.sharedOutline.id)!.access)
      .toEqual([expect.objectContaining({ email: next.recipient.email, name: 'User' })]);
    const ownerSession = await (await client.get('/api/auth/browser/v1/auth/session')).json();
    expect(ownerSession).toMatchObject({ data: { user: { is_staff: false } } });

    await authenticateDjangoTestUser(reader, resolveApiServerOrigin(), next.recipient);
    const received = await (await reader.get('/api/documents', { failOnStatusCode: true })).json() as UserDocument[];
    expect(received.map(document => document.title).sort()).toEqual(['New Document', 'Shared outline']);
    expect(received.find(document => document.id === next.documents.sharedOutline.id)!.sharedBy)
      .toEqual(expect.objectContaining({ email: next.owner.email, name: 'User' }));
    const recipientSession = await (await reader.get('/api/auth/browser/v1/auth/session')).json();
    expect(recipientSession).toMatchObject({ data: { user: { is_staff: false } } });
  } finally {
    await Promise.all([client.dispose(), reader.dispose()]);
  }
}, SUBPROCESS_TEST_TIMEOUT_MS);
