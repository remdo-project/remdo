// Direct `/dev/*` requests do not reach Vite's normal SPA fallback in this
// dev-server stack, so the Lexical Demo route needs an exact HTML bridge.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { send } from 'vite';
import { DEV_LEXICAL_DEMO_ROUTE } from '../../src/client/app/shell/dev-route.ts';

const rejectRetiredConsentRoute: Connect.NextHandleFunction = (req, res, next) => {
  if (!/^\/oauth\/consent\/?(?:\?.*)?$/u.test(req.url ?? '')) {
    next();
    return;
  }
  res.statusCode = 404;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not Found');
};

export function remdoDevSpaRoutesPlugin(): Plugin {
  return {
    name: 'remdo-dev-spa-routes',
    apply: 'serve',
    configurePreviewServer(server) {
      server.middlewares.use(rejectRetiredConsentRoute);
    },
    configureServer(server) {
      server.middlewares.use(rejectRetiredConsentRoute);
      server.middlewares.use((req, res, next) => {
        if (req.url !== DEV_LEXICAL_DEMO_ROUTE) {
          next();
          return;
        }

        void (async () => {
          try {
            const indexPath = path.resolve(server.config.root, 'index.html');
            const html = await fs.readFile(indexPath, 'utf8');
            const transformed = await server.transformIndexHtml(DEV_LEXICAL_DEMO_ROUTE, html);
            send(req, res, transformed, 'html', { headers: server.config.server.headers });
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}
