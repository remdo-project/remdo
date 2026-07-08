// Direct `/dev/*` requests do not reach Vite's normal SPA fallback in this
// dev-server stack, so the Lexical Demo route needs an exact HTML bridge.
// Spec: docs/dev/page-dev-tools.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { send } from 'vite';

const DEV_SPA_ROUTE_PATH = '/dev/lexical-demo';

export function isDevSpaRoutePath(url?: string): boolean {
  const pathname = url?.split('?', 1)[0] ?? '';
  return pathname === DEV_SPA_ROUTE_PATH;
}

export function remdoDevSpaRoutesPlugin(): Plugin {
  return {
    name: 'remdo-dev-spa-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!isDevSpaRoutePath(req.url)) {
          next();
          return;
        }

        void (async () => {
          try {
            const indexPath = path.resolve(server.config.root, 'index.html');
            const html = await fs.readFile(indexPath, 'utf8');
            const transformed = await server.transformIndexHtml(req.url ?? DEV_SPA_ROUTE_PATH, html);
            send(req, res, transformed, 'html', { headers: server.config.server.headers });
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}
