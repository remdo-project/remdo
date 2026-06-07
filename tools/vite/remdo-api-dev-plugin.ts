import { getRequestListener } from '@hono/node-server';
import type { Plugin, ViteDevServer } from 'vite';
import type { createServerRuntime } from '../../src/server/runtime';

const API_MODULE_ID = '/src/server/runtime.ts';

type ServerRuntimeFactory = typeof createServerRuntime;
type ServerRuntime = ReturnType<ServerRuntimeFactory>;

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
  const runtime = mod.createServerRuntime();
  return {
    createServerRuntime: mod.createServerRuntime,
    runtime,
  };
}

export function remdoApiDevPlugin(): Plugin {
  let loaded: LoadedServerApp | null = null;

  return {
    name: 'remdo-api-dev',
    apply: 'serve',
    configureServer(server) {
      const listener = getRequestListener(
        async (request) => {
          loaded = await getServerApp(server, loaded);
          return loaded.runtime.app.fetch(request);
        },
        { overrideGlobalObjects: false },
      );

      server.httpServer?.once('close', () => {
        void loaded?.runtime.close();
      });

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
