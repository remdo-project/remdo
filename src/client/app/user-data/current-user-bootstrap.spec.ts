import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUserBootstrapQuery, getCachedCurrentUserBootstrap, clearCurrentUserBootstrapCache } from './current-user-bootstrap';

const hasRememberedSessionMock = vi.hoisted(() => vi.fn());
vi.mock('#client/app/session/client', () => ({
  hasRememberedSession: hasRememberedSessionMock,
  isLikelyFetchUnavailableError: (error: unknown) => error instanceof TypeError,
}));
const BOOTSTRAP = { userId: 'alice', publicServer: false };
const clients: QueryClient[] = [];
function client() {
  const instance = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(instance);
  return instance;
}
async function rememberBootstrap() {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(BOOTSTRAP)));
  await client().query(currentUserBootstrapQuery('alice'));
}

beforeEach(() => {
  localStorage.clear();
  hasRememberedSessionMock.mockReset();
});
afterEach(() => {
  for (const instance of clients.splice(0)) { instance.clear(); }
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe('current user bootstrap', () => {
  it('revalidates a remembered offline result when connectivity returns', async () => {
    await rememberBootstrap();
    hasRememberedSessionMock.mockReturnValue(true);
    onlineManager.setOnline(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const queries = client();
    queries.mount();
    const observer = new QueryObserver(queries, currentUserBootstrapQuery('alice'));
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(BOOTSTRAP));
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...BOOTSTRAP, publicServer: true })));
      onlineManager.setOnline(true);
      await vi.waitFor(() => expect(observer.getCurrentResult().data?.publicServer).toBe(true));
      expect(getCachedCurrentUserBootstrap()?.publicServer).toBe(true);
    } finally {
      unsubscribe();
      queries.unmount();
    }
  });

  it('stores a successful bootstrap and lets Query deduplicate subsequent reads', async () => {
    const fetchMock = vi.fn(async () => Response.json(BOOTSTRAP));
    vi.stubGlobal('fetch', fetchMock);
    const queries = client();
    await Promise.all([queries.query(currentUserBootstrapQuery('alice')), queries.query(currentUserBootstrapQuery('alice'))]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedCurrentUserBootstrap()).toEqual(BOOTSTRAP);
  });

  it('opens a remembered account offline using its durable bootstrap', async () => {
    await rememberBootstrap();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(client().query(currentUserBootstrapQuery('alice'))).resolves.toEqual(BOOTSTRAP);
  });

  it('does not reuse stored bootstrap for another account or without remembered authentication', async () => {
    await rememberBootstrap();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(client().query(currentUserBootstrapQuery('alice'))).rejects.toThrow('offline');
    hasRememberedSessionMock.mockReturnValue(true);
    await expect(client().query(currentUserBootstrapQuery('bob'))).rejects.toThrow('offline');
  });

  it('keeps reachable server errors visible instead of using an offline fallback', async () => {
    await rememberBootstrap();
    hasRememberedSessionMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
    await expect(client().query(currentUserBootstrapQuery('alice'))).rejects.toThrow('Request failed: 500');
  });

  it('cannot persist a late bootstrap after its account cache is cleared', async () => {
    const queries = client();
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const options = currentUserBootstrapQuery('alice');
    const query = options.queryFn!;
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => { settle = resolve; });
    const load = queries.query({
      ...options,
      queryFn: async (context) => {
        try { return await query(context); } finally { settle(); }
      },
    }).catch(() => {});
    queries.clear();
    clearCurrentUserBootstrapCache();
    release(Response.json(BOOTSTRAP));
    await Promise.all([load, settled]);
    expect(getCachedCurrentUserBootstrap()).toBeNull();
  });

  it('rejects a server bootstrap for a different authenticated account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(BOOTSTRAP)));
    await expect(client().query(currentUserBootstrapQuery('bob'))).rejects.toThrow('account changed');
    expect(getCachedCurrentUserBootstrap()).toBeNull();
  });
});
