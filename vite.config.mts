import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserEnv, env } from "#env-server";
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPreviewSession = env.VITEST_PREVIEW;

export default defineConfig(() => {
  return {
    build: {
      outDir: "data/dist",
      emptyOutDir: true,
    },
    server: {
      host: env.HOST,
      port: env.PORT,
      strictPort: true,
      allowedHosts: true as const,
      hmr: isPreviewSession ? undefined : {
        port: env.HMR_PORT,
      },
    },
    preview: {
      host: "0.0.0.0",
      strictPort: true,
    },
    define: Object.fromEntries(
      Object.entries(browserEnv).map(([key, value]) => [
        `import.meta.env.VITE_${key}`,
        JSON.stringify(value),
      ])
    ),
    resolve: {
      alias: {
        "@": "/src",
        "#tests": path.resolve(__dirname, "./tests/unit/_support/lib/index.ts"),
        "#fixtures": path.resolve(__dirname, "./tests/fixtures"),
        "#env-server": path.resolve(__dirname, "./config/env.server.ts"),
        "#env-client": path.resolve(__dirname, "./config/env.client.ts"),
      },
    },
    test: {
      environment: 'jsdom',
      globalSetup: './tests/unit/_support/services/collab-server.ts',
      setupFiles: [
        './tests/unit/_support/setup/global/index.ts',
        './tests/unit/_support/setup/editor/install-editor-fixture.tsx'
      ],
      include: ['tests/**/*.spec.{ts,tsx}'],
      css: true,
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
