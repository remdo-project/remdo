import { getRequestListener } from '@hono/node-server';
import type { Plugin, ViteDevServer } from 'vite';
import type { createServerRuntime } from '../../src/server/runtime.ts';

const API_MODULE_ID = '/src/server/runtime.ts';

type ServerRuntimeFactory = typeof createServerRuntime;
type ServerRuntime = Awaited<ReturnType<ServerRuntimeFactory>>;

interface ServerAppModule {
  createServerRuntime: ServerRuntimeFactory;
}

interface LoadedServerApp {
  createServerRuntime: ServerRuntimeFactory;
  runtime: ServerRuntime;
}

export function isApiRequestPath(url?: string): boolean {
  const pathname = url?.split('?', 1)[0] ?? '';
  return pathname === '/api'
    || pathname.startsWith('/api/')
    || pathname === '/.well-known/openid-configuration'
    || pathname === '/.well-known/oauth-authorization-server';
}

async function getServerApp(
  server: ViteDevServer,
  loaded: LoadedServerApp | null,
): Promise<LoadedServerApp> {
  const mod = await server.ssrLoadModule(API_MODULE_ID) as ServerAppModule;
  if (loaded?.createServerRuntime === mod.createServerRuntime) {
    return loaded;
  }

  await loaded?.runtime.close();
  const runtime = await mod.createServerRuntime();
  return {
    createServerRuntime: mod.createServerRuntime,
    runtime,
  };
}

export function remdoApiDevPlugin(): Plugin {
  let loaded: LoadedServerApp | null = null;
  let loadTail = Promise.resolve();
  let closing = false;

  return {
    name: 'remdo-api-dev',
    apply: 'serve',
    async closeServer() {
      closing = true;
      await loadTail;
      await loaded?.runtime.close();
    },
    configureServer(server) {
      loaded = null;
      loadTail = Promise.resolve();
      closing = false;
      const listener = getRequestListener(
        async (request) => {
          if (closing) {
            return new Response('Server is shutting down.', { status: 503 });
          }
          const pending = loadTail.then(async () => {
            loaded = await getServerApp(server, loaded);
            return loaded.runtime;
          });
          loadTail = pending.then(() => {}, () => {});
          const runtime = await pending;
          // Shutdown can begin while initialization is awaited.
          // eslint-disable-next-line ts/no-unnecessary-condition
          if (closing) {
            return new Response('Server is shutting down.', { status: 503 });
          }
          return runtime.app.fetch(request);
        },
        { overrideGlobalObjects: false },
      );

      server.middlewares.use((req, res, next) => {
        if (!isApiRequestPath(req.url)) {
          next();
          return;
        }

        void listener(req, res).catch(next);
      });
    },
  };
}
