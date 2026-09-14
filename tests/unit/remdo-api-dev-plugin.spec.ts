import type { ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { remdoApiDevPlugin } from '../../config/vite/remdo-api-dev-plugin';
import { createDeferred } from './_support/deferred';

const transport = vi.hoisted(() => ({ fetch: null as ((request: Request) => Promise<Response>) | null }));
vi.mock('@hono/node-server', () => ({
  getRequestListener: (fetch: (request: Request) => Promise<Response>) => {
    transport.fetch = fetch;
    return vi.fn();
  },
}));

describe('development API initialization', () => {
  it('shares initialization across concurrent requests and drains it before close', async () => {
    const started = createDeferred();
    const release = createDeferred();
    const closed = createDeferred();
    const close = vi.fn(() => closed.promise);
    const fetch = vi.fn(() => new Response('ready'));
    const createServerRuntime = vi.fn(async () => {
      started.resolve();
      await release.promise;
      return { app: { fetch }, close };
    });
    const server = {
      ssrLoadModule: vi.fn(async () => ({ createServerRuntime })),
      middlewares: { use: vi.fn() },
    } as unknown as ViteDevServer;
    const plugin = remdoApiDevPlugin();
    const configure = plugin.configureServer as (server: ViteDevServer) => void;
    configure(server);
    const first = transport.fetch!(new Request('http://localhost/api/health'));
    const second = transport.fetch!(new Request('http://localhost/api/health'));
    await started.promise;
    expect(createServerRuntime).toHaveBeenCalledOnce();
    const stop = (plugin.closeServer as () => Promise<void>)();
    let stopped = false;
    void stop.then(() => { stopped = true; });
    expect((await transport.fetch!(new Request('http://localhost/api/health'))).status).toBe(503);
    expect(close).not.toHaveBeenCalled();
    release.resolve();
    expect((await first).status).toBe(503);
    expect((await second).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(createServerRuntime).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(stopped).toBe(false);
    closed.resolve();
    await stop;
    expect(stopped).toBe(true);
    expect((await transport.fetch!(new Request('http://localhost/api/health'))).status).toBe(503);

    configure(server);
    expect(await (await transport.fetch!(new Request('http://localhost/api/health'))).text()).toBe('ready');
    expect(createServerRuntime).toHaveBeenCalledTimes(2);
    await (plugin.closeServer as () => Promise<void>)();
  });

  it('retries a failed initialization on the next request', async () => {
    const createServerRuntime = vi.fn()
      .mockRejectedValueOnce(new Error('initialization failed'))
      .mockResolvedValueOnce({ app: { fetch: () => new Response('ready') }, close: vi.fn() });
    const server = {
      ssrLoadModule: vi.fn(async () => ({ createServerRuntime })),
      middlewares: { use: vi.fn() },
    } as unknown as ViteDevServer;
    const configure = remdoApiDevPlugin().configureServer as (server: ViteDevServer) => void;
    configure(server);

    await expect(transport.fetch!(new Request('http://localhost/api/health')))
      .rejects.toThrow('initialization failed');
    expect(await (await transport.fetch!(new Request('http://localhost/api/health'))).text()).toBe('ready');
    expect(createServerRuntime).toHaveBeenCalledTimes(2);
  });

});
