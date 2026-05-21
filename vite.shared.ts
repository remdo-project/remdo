import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from 'vite-plugin-pwa';
import { config } from './config';
import { onRollupWarning } from './config/_internal/vite/onRollupWarning';
import { resolveApiServerOrigin, resolveCollabServerOrigin } from './lib/net/origins';
import { remdoApiDevPlugin } from './tools/vite/remdo-api-dev-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPreviewSession = config.env.VITEST_PREVIEW;
const host = config.env.HOST;
const apiServerTarget = resolveApiServerOrigin({ loopback: true });
const collabServerTarget = resolveCollabServerOrigin({ loopback: true });
const pwaNavigationFallbackDenylist = [
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
      VitePWA({
        includeAssets: ['icons/*.svg'],
        registerType: 'autoUpdate',
        manifest: {
          name: 'RemDo',
          short_name: 'RemDo',
          background_color: '#1a1b1e',
          theme_color: '#1a1b1e',
          icons: [
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
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
        ignored: ['**/data/**'],
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
        "@": "/src",
        "#tests": path.resolve(__dirname, "./tests/unit/_support/lib/index.ts"),
        "#tests-common": path.resolve(__dirname, "./tests/_support"),
        "#fixtures": path.resolve(__dirname, "./tests/fixtures"),
        "#config": path.resolve(__dirname, "./config"),
        "#lib": path.resolve(__dirname, "./lib"),
        "#tools": path.resolve(__dirname, "./tools/lib"),
      },
    },
  };
}
