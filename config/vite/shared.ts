import path from "node:path";
import type { Plugin, ProxyOptions } from 'vite';
import { fileURLToPath } from "node:url";
import { VitePWA } from 'vite-plugin-pwa';
import { config } from '../index.ts';
import { onRollupWarning } from '../_internal/vite/onRollupWarning.ts';
import { resolveApiServerOrigin, resolveCollabServerOrigin, resolveMcpServerOrigin } from '../../src/platform/net/origins.ts';
import { shouldProxyToDjango } from './gateway-routes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const host = config.env.HOST;
// Must match Django's app routes (backend/remdo/urls.py); a route missing
// from either fails only offline or only online. Workbox matches pathname plus
// search.
const APP_ROUTE_PATTERN = /^(?:\/|\/n\/[^?]*|\/sign-out\/?)(?:\?.*)?$/u;
const collabServerTarget = resolveCollabServerOrigin();
const stripInternalHeaders: ProxyOptions['configure'] = (proxy) => {
  const strip = (request: { removeHeader: (name: string) => void }) => {
    request.removeHeader('X-Remdo-Collaboration-Secret');
    request.removeHeader('X-Remdo-Collaboration-Operator');
  };
  proxy.on('proxyReq', strip);
  proxy.on('proxyReqWs', strip);
};
const privateRouteGuard: Plugin = {
  name: 'private-collaboration-routes',
  configureServer(server) { installPrivateRouteGuard(server); },
};
function installPrivateRouteGuard(server: Pick<import('vite').ViteDevServer, 'middlewares'>) {
  server.middlewares.use((req, res, next) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    if (pathname === '/internal' || pathname.startsWith('/internal/')) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }
    next();
  });
}
const apiProxy = { target: resolveApiServerOrigin(), changeOrigin: false, configure: stripInternalHeaders };
const devProxy = {
  '^/collaboration(?:$|\\?)': {
    target: collabServerTarget,
    changeOrigin: false,
    configure: stripInternalHeaders,
    ws: true,
  },
  '^/mcp(?:$|[/?])': {
    target: resolveMcpServerOrigin(),
    changeOrigin: false,
    configure: stripInternalHeaders,
  },
  '/': {
    ...apiProxy,
    bypass(req: { url?: string }) {
      if (!shouldProxyToDjango(req.url ?? '/')) return req.url;
    },
  },
} as const;
export function createViteSharedConfig() {
  return {
    build: {
      rollupOptions: {
        onwarn: onRollupWarning,
      },
    },
    plugins: [
      privateRouteGuard,
      VitePWA({
        includeAssets: ['icons/*.svg', 'logo.svg'],
        registerType: 'autoUpdate',
        manifest: {
          name: 'RemDo',
          short_name: 'RemDo',
          background_color: '#17151f',
          theme_color: '#17151f',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Django renders the app page, so it is outside the build output.
          // A new revision per build refreshes the stored page with the assets.
          // `/` itself depends on the session, so the page is stored from a
          // fixed address instead.
          additionalManifestEntries: [{ url: '/app-shell/', revision: String(Date.now()) }],
          navigateFallback: '/app-shell/',
          navigateFallbackAllowlist: [APP_ROUTE_PATTERN],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname === '/collaboration',
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    server: {
      host,
      port: config.env.PORT,
      strictPort: true,
      watch: {
        ignored: ['**/data/**', '**/.agent/**'],
      },
      allowedHosts: true as const,
      proxy: devProxy,
    },
    // Key the prebundle cache to the port block, like every other per-instance path. Sharing one
    // cache means a second dev server re-optimizes it under a running one, which keeps serving its
    // now-stale module graph and ends up with two copies of a package (for Lexical: "cannot find a
    // LexicalComposerContext"). Recovery needs a cache wipe plus a restart.
    cacheDir: `node_modules/.vite/${config.env.PORT}`,
    define: Object.fromEntries(
      Object.entries(config.browser).map(([key, value]) => [
        `import.meta.env.VITE_${key}`,
        JSON.stringify(value),
      ])
    ),
    resolve: {
      // lexical joins react here for the same reason: its modules hold module-scoped state
      // (the composer context, node registries) that breaks if two copies are resolved.
      dedupe: ["react", "react-dom", "lexical"],
      alias: {
        "#client": path.resolve(repoRoot, "./src/client"),
        "#collaboration": path.resolve(repoRoot, "./src/collaboration"),
        "#tests": path.resolve(repoRoot, "./tests/unit/_support/lib/index.ts"),
        "#tests-collab": path.resolve(repoRoot, "./tests/unit/collab/_support"),
        "#tests-common": path.resolve(repoRoot, "./tests/_support"),
        "#fixtures": path.resolve(repoRoot, "./tests/fixtures"),
        "#config": path.resolve(repoRoot, "./config"),
        "#domain": path.resolve(repoRoot, "./src/domain"),
        "#note-sdk": path.resolve(repoRoot, "./src/note-sdk/index.ts"),
        "#platform": path.resolve(repoRoot, "./src/platform"),
        "#document-routes": path.resolve(repoRoot, "./src/document-routes/index.ts"),
        "#tools": path.resolve(repoRoot, "./tools/lib"),
      },
    },
  };
}
