import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from 'vite-plugin-pwa';
import { config } from './config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPreviewSession = config.env.VITEST_PREVIEW;

export function createViteSharedConfig() {
  return {
    plugins: [
      VitePWA({
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
          // Disable vite-plugin-pwa's default app-shell NavigationRoute so our
          // custom navigation runtimeCaching blocklist is the source of truth.
          navigateFallback: undefined,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === 'navigate' &&
                ![
                  // Auth/UI routes served by tinyauth.
                  /^\/(?:login|authorize|logout|continue|totp|forgot-password|unauthorized|error)(?:\/|$)/,
                  // Tinyauth static assets.
                  /^\/resources(?:\/|$)/,
                  // Server APIs.
                  /^\/api(?:\/|$)/,
                  // Collaboration backend routes (not SPA document pages).
                  /^\/doc(?:\/|$)/,
                  /^\/d(?:\/|$)/,
                ].some((pattern) => pattern.test(url.pathname)),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'app-shell-navigation',
                networkTimeoutSeconds: 5,
                precacheFallback: {
                  fallbackURL: '/index.html',
                },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/doc') || url.pathname.startsWith('/d/'),
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
      host: config.env.HOST,
      port: config.env.PORT,
      strictPort: true,
      watch: {
        ignored: ['**/data/**'],
      },
      allowedHosts: true as const,
      proxy: {
        '/doc': {
          target: `http://${config.env.HOST}:${config.env.COLLAB_CLIENT_PORT}`,
          changeOrigin: true,
        },
      },
      hmr: isPreviewSession ? undefined : {
        port: config.env.HMR_PORT,
      },
    },
    preview: {
      host: config.env.HOST,
      port: config.env.PREVIEW_PORT,
      strictPort: true,
      proxy: {
        '/doc': {
          target: `http://${config.env.HOST}:${config.env.COLLAB_CLIENT_PORT}`,
          changeOrigin: true,
        },
      },
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
