import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from 'vite-plugin-pwa';
import { config } from '../index.ts';
import { onRollupWarning } from '../_internal/vite/onRollupWarning.ts';
import { resolveCollabServerOrigin, resolveLocalGatewayOrigin } from '../../src/platform/net/origins.ts';
import { remdoApiDevPlugin } from './remdo-api-dev-plugin.ts';
import { remdoDevSpaRoutesPlugin } from './remdo-dev-spa-routes-plugin.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const host = config.env.HOST;
const collabServerTarget = resolveCollabServerOrigin();
const mainGatewayTarget = resolveLocalGatewayOrigin();
export const pwaNavigationFallbackDenylist = [
  /^\/\.well-known(?:\/|$)/u,
  /^\/api(?:\/|$)/u,
  /^\/d(?:\/|$)/u,
];
const devProxy = {
  '/d': {
    target: collabServerTarget,
    changeOrigin: true,
    ws: true,
  },
} as const;
const mainGatewayProxy = {
  target: mainGatewayTarget,
  changeOrigin: true,
} as const;
const previewProxy = {
  '/.well-known': {
    ...mainGatewayProxy,
    xfwd: true,
  },
  '/api': {
    ...mainGatewayProxy,
    xfwd: true,
  },
  '/d': {
    ...mainGatewayProxy,
    ws: true,
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
      remdoApiDevPlugin(),
      remdoDevSpaRoutesPlugin(),
      VitePWA({
        includeAssets: ['icons/*.svg', 'favicon.png'],
        registerType: 'autoUpdate',
        manifest: {
          name: 'RemDo',
          short_name: 'RemDo',
          background_color: '#1a1b1e',
          theme_color: '#1a1b1e',
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
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: pwaNavigationFallbackDenylist,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/d/'),
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
    preview: {
      // Service workers require a trustworthy origin. Keep the manual PWA
      // preview on IPv4 loopback; remote developers reach it through a tunnel.
      host: '127.0.0.1',
      // No port here: the PWA launcher (tools/dev/pwa.sh) owns the preview port
      // via --port; deriving one from PORT would collide with the dev gateway.
      strictPort: true,
      proxy: previewProxy,
    },
    // Key the prebundle cache to the port block, like every other per-instance path. Sharing one
    // cache means a second dev server re-optimizes it under a running one, which keeps serving its
    // now-stale module graph and ends up with two copies of a package (for Lexical: "cannot find a
    // LexicalComposerContext"). Recovery needs a cache wipe plus a restart.
    cacheDir: `node_modules/.vite/${config.env.PORT}`,
    assetsInclude: ['**/*.ysweet'],
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
        "#tests-common": path.resolve(repoRoot, "./tests/_support"),
        "#fixtures": path.resolve(repoRoot, "./tests/fixtures"),
        "#config": path.resolve(repoRoot, "./config"),
        "#domain": path.resolve(repoRoot, "./src/domain"),
        "#note-sdk": path.resolve(repoRoot, "./src/note-sdk/index.ts"),
        "#platform": path.resolve(repoRoot, "./src/platform"),
        "#projection": path.resolve(repoRoot, "./src/projection"),
        "#document-routes": path.resolve(repoRoot, "./src/document-routes.ts"),
        "#server": path.resolve(repoRoot, "./src/server"),
        "#tools": path.resolve(repoRoot, "./tools/lib"),
      },
    },
  };
}
