import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const DEV_SPA_ROUTE_PATHS = new Set(['/dev/lexical-demo']);

export function isDevSpaRoutePath(url?: string): boolean {
  const pathname = url?.split('?', 1)[0] ?? '';
  return DEV_SPA_ROUTE_PATHS.has(pathname);
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
            const transformed = await server.transformIndexHtml(req.url ?? '/', html);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(transformed);
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}
