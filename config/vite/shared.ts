import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from 'vite-plugin-pwa';
import { config } from '../index';
import { onRollupWarning } from '../_internal/vite/onRollupWarning';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from '../../src/platform/net/origins';
import { remdoApiDevPlugin } from './remdo-api-dev-plugin';
import { remdoDevSpaRoutesPlugin } from './remdo-dev-spa-routes-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const isPreviewSession = config.env.VITEST_PREVIEW;
const host = config.env.HOST;
const apiServerTarget = resolveApiServerOrigin({ loopback: true });
const collabServerTarget = resolveCollabServerOrigin({ loopback: true });
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
const previewProxy = {
  '/.well-known': {
    target: apiServerTarget,
    changeOrigin: true,
    xfwd: true,
  },
  '/api': {
    target: apiServerTarget,
    changeOrigin: true,
    xfwd: true,
  },
  ...devProxy,
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
      hmr: isPreviewSession ? undefined : {
        port: config.env.HMR_PORT,
      },
    },
    preview: {
      host,
      port: config.env.PREVIEW_PORT,
      // Mirror the dev server: accept any Host header (e.g. http://hostname:PORT),
      // not just localhost, so the prod-build preview is reachable by hostname.
      allowedHosts: true as const,
      strictPort: true,
      proxy: previewProxy,
    },
    assetsInclude: ['**/*.ysweet'],
    define: Object.fromEntries(
      Object.entries(config.browser).map(([key, value]) => [
        `import.meta.env.VITE_${key}`,
        JSON.stringify(value),
      ])
    ),
    resolve: {
      dedupe: ["react", "react-dom"],
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
