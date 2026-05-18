import { getRequestListener } from '@hono/node-server';
import type { Plugin, ViteDevServer } from 'vite';
import type { createServerApp } from '../../src/server/app';

const API_MODULE_ID = '/src/server/app.ts';

type ServerAppFactory = typeof createServerApp;
type ServerApp = ReturnType<ServerAppFactory>;

interface ServerAppModule {
  createServerApp: ServerAppFactory;
}

interface LoadedServerApp {
  app: ServerApp;
  createServerApp: ServerAppFactory;
}

export function isApiRequestPath(url?: string): boolean {
  const pathname = url?.split('?', 1)[0] ?? '';
  return pathname === '/api' || pathname.startsWith('/api/');
}

async function getServerApp(
  server: ViteDevServer,
  loaded: LoadedServerApp | null,
): Promise<LoadedServerApp> {
  const mod = await server.ssrLoadModule(API_MODULE_ID) as ServerAppModule;
  if (loaded?.createServerApp === mod.createServerApp) {
    return loaded;
  }

  return {
    app: mod.createServerApp(),
    createServerApp: mod.createServerApp,
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
          return loaded.app.fetch(request);
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
