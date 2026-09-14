import { afterEach, describe, expect, it, vi } from 'vitest';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { createTestResource } from '../_support/test-resource';
import { createDeferred } from '../_support/deferred';
import { createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);
type Harness = ReturnType<typeof createServerAppHarness>;

function rename(harness: Harness, headers: Headers, id: string, title: unknown) {
  const jsonHeaders = new Headers(headers);
  jsonHeaders.set('content-type', 'application/json');
  return harness.app.request(`/api/documents/${id}`, {
    method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ title }),
  });
}

async function bootstrap(harness: Harness, headers: Headers) {
  const response = await harness.app.request('/api/current-user', { headers });
  return response.json() as Promise<{ homeDocumentId: string; userDataDocumentId: string }>;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('document rename', () => {
  it('renames for a direct grantee and publishes the complete name to both users', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders();
    const granteeHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    const owner = await harness.getSessionUserId(ownerHeaders);
    const grantee = await harness.getSessionUserId(granteeHeaders);
    const document = await harness.registry.insertDocument({ id: 'sharedDoc', ownerUserId: owner, title: 'Original' });
    await harness.registry.grantDocumentAccess('sharedDoc', owner, grantee);
    const ownerData = await bootstrap(harness, ownerHeaders);
    const granteeData = await bootstrap(harness, granteeHeaders);

    expect((await rename(harness, granteeHeaders, 'sharedDoc', '  Team  plans  ')).status).toBe(200);
    expect(await harness.registry.getDocument('sharedDoc')).toMatchObject({ ...document, title: 'Team  plans', updatedAt: expect.any(Date) });
    for (const data of [ownerData, granteeData]) {
      expect(harness.readProjectedDocumentTitle(data.userDataDocumentId, 'sharedDoc')).toBe('Team  plans');
    }
    expect(await harness.registry.getDocumentAccessForGrantee('sharedDoc', grantee)).not.toBeNull();
  });

  it('rejects empty names, missing documents, strangers, revoked access and projection writes', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const other = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    const userId = await harness.getSessionUserId(headers);
    const otherId = await harness.getSessionUserId(other);
    const data = await bootstrap(harness, headers);
    await harness.registry.insertDocument({ id: 'privateDoc', ownerUserId: userId, title: 'Original' });
    expect((await rename(harness, new Headers(), 'privateDoc', 'Denied')).status).toBe(401);
    expect((await rename(harness, other, 'privateDoc', 'Denied')).status).toBe(404);
    expect((await rename(harness, headers, 'missingDoc', 'Missing')).status).toBe(404);
    expect((await rename(harness, headers, data.userDataDocumentId, 'Denied')).status).toBe(404);
    for (const invalid of ['', ' \n ', 42]) {
      expect((await rename(harness, headers, 'privateDoc', invalid)).status).toBe(400);
    }
    await harness.registry.grantDocumentAccess('privateDoc', userId, otherId);
    await harness.database.db.deleteFrom('document_access').where('document_id', '=', 'privateDoc').execute();
    expect((await rename(harness, other, 'privateDoc', 'Denied')).status).toBe(404);
    expect((await harness.registry.getDocument('privateDoc'))?.title).toBe('Original');
  });

  it('keeps a renamed home document through bootstrap and permits duplicate names', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const data = await bootstrap(harness, headers);
    await harness.registry.insertDocument({ id: 'otherDoc', ownerUserId: await harness.getSessionUserId(headers), title: 'My notes' });
    expect((await rename(harness, headers, data.homeDocumentId, 'My notes')).status).toBe(200);
    await bootstrap(harness, headers);
    expect((await harness.registry.getDocument(data.homeDocumentId))?.title).toBe('My notes');
    expect(harness.readProjectedDocumentTitle(data.userDataDocumentId, data.homeDocumentId)).toBe('My notes');
  });

  it.each([false, true])('publishes the last committed rename after a delayed projection (failure: %s)', async (failFirst) => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const blocked = createDeferred();
    const release = createDeferred();
    let delayNext = false;
    const harness = createHarness({ onUpdateDoc: async () => {
      if (delayNext) {
        delayNext = false;
        blocked.resolve();
        await release.promise;
        if (failFirst) throw new Error('projection refresh failed');
      }
    } });
    const headers = await harness.createSessionHeaders();
    const data = await bootstrap(harness, headers);
    delayNext = true;
    const first = rename(harness, headers, data.homeDocumentId, 'First name');
    await blocked.promise;
    const second = rename(harness, headers, data.homeDocumentId, 'Last name');
    try {
      await expect.poll(async () => (await harness.registry.getDocument(data.homeDocumentId))?.title).toBe('Last name');
    } finally {
      release.resolve();
    }
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(harness.readProjectedDocumentTitle(data.userDataDocumentId, data.homeDocumentId)).toBe('Last name');
    expect(diagnostic).toHaveBeenCalledTimes(failFirst ? 1 : 0);
    if (failFirst) expect(diagnostic).toHaveBeenCalledWith('[remdo-api] user-data-projection.refresh-failed');
  });

  it('routes linked-source rename to the source identity and leaves the home registry untouched', async () => {
    const server = { id: 'source', label: 'Source', baseUrl: 'https://source.example', credentials: { clientId: 'test-client' } };
    const home = createHarness({ sourceServers: [server] });
    const source = createHarness();
    const headers = await home.createSessionHeaders();
    const sourceHeaders = await source.createSessionHeaders(STABLE_AUTH_USERS.bob);
    const sourceUser = (await source.auth.getSession(sourceHeaders))!.user;
    source.auth.resolveBearerUser = vi.fn(async (token) => token === 'Bearer source-token' ? sourceUser : null);
    home.auth.getLinkedRemdoServerAccessToken = vi.fn(async () => 'source-token');
    await source.registry.insertDocument({ id: 'sourceDoc', ownerUserId: sourceUser.id, title: 'Source title' });
    await home.registry.insertDocument({ id: 'sourceDoc', ownerUserId: await home.getSessionUserId(headers), title: 'Home title' });
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => source.app.request(url, init));
    const jsonHeaders = new Headers(headers);
    jsonHeaders.set('content-type', 'application/json');
    const request = () => home.app.request('/api/current-user/source-servers/source/documents/sourceDoc', {
      method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ title: 'Renamed source' }),
    });
    expect((await request()).status).toBe(200);
    expect((await source.registry.getDocument('sourceDoc'))?.title).toBe('Renamed source');
    expect((await home.registry.getDocument('sourceDoc'))?.title).toBe('Home title');
    home.auth.getLinkedRemdoServerAccessToken = vi.fn(async () => null);
    expect((await request()).status).toBe(403);
  });
});
