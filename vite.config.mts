import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config } from './config';
import { configDefaults, defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPreviewSession = config.env.VITEST_PREVIEW;
const isVitestUi = process.argv.includes('--ui');

export default defineConfig(() => {
  return {
    build: {
      outDir: "data/dist",
      assetsDir: "app-assets",
      emptyOutDir: true,
    },
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
    test: {
      environment: 'jsdom',
      globalSetup: './tests/global/collab-server-setup.ts',
      setupFiles: ['./tests/unit/_support/setup/index.ts'],
      include: [
        ...configDefaults.include,
        'tests/unit/**/*.spec.{ts,tsx}',
      ],
      exclude: [
        ...configDefaults.exclude,
        '**/.pnpm-store/**',
        '**/data/**',
        'tests/e2e/**',
        ...(config.env.COLLAB_ENABLED ? [] : ['tests/unit/collab/**']),
      ],
      css: true,
      slowTestThreshold: config.env.COLLAB_ENABLED ? 4000 : undefined,
      api: isVitestUi ? {
        host: config.env.HOST,
        port: config.env.VITEST_PORT,
        strictPort: true,
      } : undefined,
      threads: true,
      testTimeout: 5000,
      hookTimeout: 5000,
      teardownTimeout: 5000,
      coverage: {
        provider: 'v8' as const,
        reportsDirectory: 'data/coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx'],
      },
      open: false,
    }
  };
});
