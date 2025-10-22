import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "#env-server";
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
    resolve: {
      alias: {
        "@": "/src",
        "#test": path.resolve(__dirname, "./tests/unit"),
        "#env-server": path.resolve(__dirname, "./config/env.server.ts"),
        "#env-client": path.resolve(__dirname, "./config/env.client.ts"),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: [
        './tests/unit/setup/global.ts',
        './tests/unit/setup/each.tsx'
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
