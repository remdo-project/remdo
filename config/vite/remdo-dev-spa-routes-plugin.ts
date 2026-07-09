// Direct `/dev/*` requests do not reach Vite's normal SPA fallback in this
// dev-server stack, so the Lexical Demo route needs an exact HTML bridge.
// Spec: docs/dev/dev-tooling.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { send } from 'vite';
import { DEV_LEXICAL_DEMO_ROUTE, isDevSpaFallbackPath } from '../../src/client/app/dev/dev-route';

export function remdoDevSpaRoutesPlugin(): Plugin {
  return {
    name: 'remdo-dev-spa-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!isDevSpaFallbackPath(req.url)) {
          next();
          return;
        }

        void (async () => {
          try {
            const indexPath = path.resolve(server.config.root, 'index.html');
            const html = await fs.readFile(indexPath, 'utf8');
            const transformed = await server.transformIndexHtml(req.url ?? DEV_LEXICAL_DEMO_ROUTE, html);
            send(req, res, transformed, 'html', { headers: server.config.server.headers });
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}
