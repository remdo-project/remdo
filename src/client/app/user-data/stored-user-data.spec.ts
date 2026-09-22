import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserDataRuntime, getUserDataRuntime, resetUserDataRuntime } from './stored-user-data';
import type { UserDataRuntime } from './stored-user-data';

const runtimes: UserDataRuntime[] = [];
function account(userId = 'alice') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const runtime = createUserDataRuntime(userId, client);
  runtimes.push(runtime);
  return runtime;
}

function documentRequests(handler: (request: Request) => Response | Promise<Response>, userId = 'alice') {
  vi.stubGlobal('fetch', vi.fn((request: Request) => {
    if (new URL(request.url).pathname === '/api/current-user') {
      return Promise.resolve(Response.json({ userId }));
    }
    return Promise.resolve(handler(request));
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => { resolve = release; });
  return { promise, resolve };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.dispose();
  }
  resetUserDataRuntime();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe('account metadata', () => {
  it('lists documents while the account bootstrap is still pending', async () => {
    const runtime = account();
    const bootstrapResponse = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((request: Request) => new URL(request.url).pathname === '/api/current-user'
      ? bootstrapResponse.promise
      : Promise.resolve(Response.json([{ id: 'starter', title: 'New Document', shareable: true }]))));
    const bootstrap = runtime.client.query(runtime.bootstrapQuery);
    await runtime.client.query(runtime.documentsQuery);
    expect(runtime.userData.getDocuments().getById('starter')?.getText()).toBe('New Document');
    bootstrapResponse.resolve(Response.json({ userId: 'alice' }));
    await bootstrap;
  });

  it('recovers from a failed initial listing using the same query and SDK adapter', async () => {
    const runtime = account();
    documentRequests(() => new Response(null, { status: 503 }));
    await expect(runtime.client.query(runtime.documentsQuery)).rejects.toThrow('Request failed: 503');
    expect(runtime.client.getQueryState(runtime.documentsQuery.queryKey)?.error).not.toBeNull();

    documentRequests(() => Response.json([{ id: 'aliceDoc', title: 'Research', shareable: false }]));
    await runtime.client.query(runtime.documentsQuery);
    expect(runtime.client.getQueryState(runtime.documentsQuery.queryKey)?.error).toBeNull();
    expect(runtime.userData.getDocuments().getById('aliceDoc')?.getText()).toBe('Research');
  });

  it('uses the same cache for query subscribers and the note SDK, including creation', async () => {
    const runtime = account();
    documentRequests(async (request) => {
      if (request.method === 'POST') {
        const { title } = await request.json() as { title: string };
        return Response.json({ id: 'created', title, shareable: false }, { status: 201 });
      }
      return Response.json([{ id: 'aliceDoc', title: 'Research', shareable: false }]);
    });
    await Promise.all([runtime.client.query(runtime.bootstrapQuery), runtime.client.query(runtime.documentsQuery)]);
    const created = await runtime.userData.getDocuments().create('Research');
    expect(created.getText()).toBe('Research');
    expect(runtime.userData.getDocuments().getById('created')?.getText()).toBe('Research');
  });

  it('updates the observed document grants after sharing without duplicating a recipient', async () => {
    const runtime = account();
    const access = { documentId: 'shared', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' };
    documentRequests((request) => request.method === 'POST'
      ? Response.json(access)
      : Response.json([{ id: 'shared', title: 'Shared', shareable: true, access: [] }]));
    await runtime.client.query(runtime.documentsQuery);
    await runtime.userData.getDocuments().getById('shared')!.shareWith(access.email);
    await runtime.userData.getDocuments().getById('shared')!.shareWith(access.email);
    expect(runtime.userData.getDocuments().getById('shared')!.getAccess().getChildren().map((grant) => grant.getEmail()))
      .toEqual([access.email]);
  });

  it('shows the new name in the listing after a rename, keeping the document grants', async () => {
    const runtime = account();
    const access = { documentId: 'shared', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' };
    documentRequests((request) => request.method === 'PUT'
      ? Response.json({ id: 'shared', title: 'Quarterly plan' })
      : Response.json([{ id: 'shared', title: 'Shared', shareable: true, access: [access] }]));
    await runtime.client.query(runtime.documentsQuery);

    await runtime.userData.getDocuments().getById('shared')!.rename('Quarterly plan');

    const renamed = runtime.userData.getDocuments().getById('shared')!;
    expect(renamed.getText()).toBe('Quarterly plan');
    expect(renamed.getAccess().getChildren().map((grant) => grant.getEmail())).toEqual([access.email]);
  });

  it('keeps the stored name when the source rejects a rename', async () => {
    const runtime = account();
    documentRequests((request) => request.method === 'PUT'
      ? new Response(null, { status: 404 })
      : Response.json([{ id: 'shared', title: 'Shared', shareable: true }]));
    await runtime.client.query(runtime.documentsQuery);

    await expect(runtime.userData.getDocuments().getById('shared')!.rename('Quarterly plan'))
      .rejects.toThrow('This document is no longer available.');
    expect(runtime.userData.getDocuments().getById('shared')!.getText()).toBe('Shared');
  });

  it('explains a rejected over-long name instead of inviting an identical retry', async () => {
    const runtime = account();
    documentRequests((request) => request.method === 'PUT'
      ? Response.json({ title: ['Ensure this field has no more than 500 characters.'] }, { status: 400 })
      : Response.json([{ id: 'shared', title: 'Shared', shareable: true }]));
    await runtime.client.query(runtime.documentsQuery);

    await expect(runtime.userData.getDocuments().getById('shared')!.rename('x'.repeat(501)))
      .rejects.toThrow('Use a shorter name, up to 500 characters.');
    expect(runtime.userData.getDocuments().getById('shared')!.getText()).toBe('Shared');
  });

  it('reports a rejection it cannot attribute to length without blaming length', async () => {
    const runtime = account();
    documentRequests((request) => request.method === 'PUT'
      ? Response.json({ title: ['This field may not be blank.'] }, { status: 400 })
      : Response.json([{ id: 'shared', title: 'Shared', shareable: true }]));
    await runtime.client.query(runtime.documentsQuery);

    await expect(runtime.userData.getDocuments().getById('shared')!.rename('Quarterly plan'))
      .rejects.toThrow('That name was rejected. Try a different one.');
  });

  it('reports an unexpected rename failure in readable terms', async () => {
    const runtime = account();
    documentRequests((request) => request.method === 'PUT'
      ? new Response(null, { status: 500 })
      : Response.json([{ id: 'shared', title: 'Shared', shareable: true }]));
    await runtime.client.query(runtime.documentsQuery);

    await expect(runtime.userData.getDocuments().getById('shared')!.rename('Quarterly plan'))
      .rejects.toThrow('Could not rename the document. Please retry.');
    expect(runtime.userData.getDocuments().getById('shared')!.getText()).toBe('Shared');
  });

  it('explains a rejected recipient without changing document access', async () => {
    const runtime = account();
    runtime.client.setQueryData(runtime.documentsQuery.queryKey, [{ id: 'shared', title: 'Shared', shareable: true }]);
    documentRequests(() => Response.json({ email: ['No account with this email exists on this server.'] }, { status: 400 }));
    await expect(runtime.userData.getDocuments().getById('shared')!.shareWith('missing@example.test'))
      .rejects.toThrow('Use the email of another account on this server.');
    expect(runtime.userData.getDocuments().getById('shared')!.getAccess().getChildren()).toEqual([]);
  });

  it('rejects offline sharing without a queued grant or local access change', async () => {
    const runtime = account();
    runtime.client.setQueryData(runtime.documentsQuery.queryKey, [{ id: 'shared', title: 'Shared', shareable: true }]);
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(runtime.userData.getDocuments().getById('shared')!.shareWith('bob@example.test'))
      .rejects.toThrow('offline');
    expect(runtime.userData.getDocuments().getById('shared')!.getAccess().getChildren()).toEqual([]);
  });

  it('does not restore grants when a sharing response arrives after account departure', async () => {
    const runtime = account();
    runtime.client.setQueryData(runtime.documentsQuery.queryKey, [{ id: 'shared', title: 'Shared', shareable: true }]);
    const response = deferred<Response>();
    const started = deferred<void>();
    documentRequests(() => { started.resolve(); return response.promise; });
    const sharing = runtime.userData.getDocuments().getById('shared')!.shareWith('bob@example.test');
    const rejected = expect(sharing).rejects.toThrow();
    await started.promise;
    runtime.dispose();
    const next = account('bob');
    response.resolve(Response.json({ documentId: 'shared', granteeUserId: 'bob', email: 'bob@example.test', name: 'Bob' }));
    await rejected;
    expect(runtime.userData.getDocuments().getChildren()).toEqual([]);
    expect(next.userData.getDocuments().getChildren()).toEqual([]);
  });

  it('keeps a successful creation when the following background listing fails', async () => {
    const runtime = account();
    let refreshFails = false;
    documentRequests((request) => {
      if (request.method === 'POST') {
        refreshFails = true;
        return Response.json({ id: 'created', title: 'Research', shareable: false }, { status: 201 });
      }
      return refreshFails ? new Response(null, { status: 503 }) : Response.json([]);
    });
    const observer = new QueryObserver(runtime.client, runtime.documentsQuery);
    const refresh = deferred<void>();
    const unsubscribe = observer.subscribe((result) => { if (result.isError) { refresh.resolve(); } });
    await runtime.client.query(runtime.documentsQuery);
    const created = await runtime.userData.getDocuments().create('Research');
    await refresh.promise;
    expect(created.getId()).toBe('created');
    expect(runtime.userData.getDocuments().getById('created')?.getText()).toBe('Research');
    expect(observer.getCurrentResult().error?.message).toBe('Request failed: 503');
    unsubscribe();
  });

  it('rejects offline creation immediately without queueing an intent for reconnect', async () => {
    const runtime = account();
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(runtime.userData.getDocuments().create('Research')).rejects.toThrow('offline');
    expect(runtime.userData.getDocuments().getChildren()).toEqual([]);
  });

  it('cannot restore a departed account from a late listing', async () => {
    const alice = account();
    const response = deferred<Response>();
    const started = deferred<void>();
    documentRequests(() => { started.resolve(); return response.promise; });
    const load = alice.client.query(alice.documentsQuery).catch(() => {});
    await started.promise;
    alice.dispose();
    const bob = account('bob');
    documentRequests(() => Response.json([{ id: 'bobHome', title: 'Bob', shareable: false }]), 'bob');
    await bob.client.query(bob.documentsQuery);
    response.resolve(Response.json([{ id: 'aliceDoc', title: 'Alice', shareable: false }]));
    await load;
    expect(alice.userData.getDocuments().getChildren()).toEqual([]);
    expect(bob.userData.getDocuments().getChildren().map((doc) => doc.getId())).toEqual(['bobHome']);
  });

  it('rejects a late creation after logout and cannot refill either account cache', async () => {
    const alice = account();
    const response = deferred<Response>();
    const started = deferred<void>();
    documentRequests(() => { started.resolve(); return response.promise; });
    const creation = alice.userData.getDocuments().create('Private');
    const rejected = expect(creation).rejects.toThrow();
    await started.promise;
    alice.dispose();
    const bob = account('bob');
    response.resolve(Response.json({ id: 'private', title: 'Private', shareable: false }, { status: 201 }));
    await rejected;
    expect(alice.userData.getDocuments().getChildren()).toEqual([]);
    expect(bob.userData.getDocuments().getChildren()).toEqual([]);
    await expect(alice.userData.getDocuments().create('Another')).rejects.toThrow();
  });

  it('retires the previous account immediately when the authenticated boundary changes identity', () => {
    const alice = getUserDataRuntime('alice');
    alice.client.setQueryData(alice.documentsQuery.queryKey, [{ id: 'private', title: 'Private', shareable: false }]);
    const bob = getUserDataRuntime('bob');
    expect(alice.userData.getDocuments().getChildren()).toEqual([]);
    expect(bob.userData.getDocuments().getChildren()).toEqual([]);
    expect(bob.client).not.toBe(alice.client);
  });
});
