import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from '#config';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPreviewSession = config.env.VITEST_PREVIEW;

export default defineConfig(() => {
  return {
    build: {
      outDir: "data/dist",
      emptyOutDir: true,
    },
    server: {
      host: config.env.HOST,
      port: config.env.PORT,
      strictPort: true,
      allowedHosts: true as const,
      hmr: isPreviewSession ? undefined : {
        port: config.env.HMR_PORT,
      },
    },
    preview: {
      host: "0.0.0.0",
      strictPort: true,
    },
    define: Object.fromEntries(
      Object.entries(config.browser).map(([key, value]) => [
        `import.meta.env.VITE_${key}`,
        JSON.stringify(value),
      ])
    ),
    resolve: {
      alias: {
        "@": "/src",
        "#tests": path.resolve(__dirname, "./tests/unit/_support/lib/index.ts"),
        "#fixtures": path.resolve(__dirname, "./tests/fixtures"),
        "#config": path.resolve(__dirname, "./config"),
        "#lib": path.resolve(__dirname, "./lib"),
      },
    },
    test: {
      environment: 'jsdom',
      globalSetup: './tests/unit/_support/services/collab-server.ts',
      setupFiles: ['./tests/unit/_support/setup/index.ts'],
      include: ['tests/**/*.spec.{ts,tsx}'],
      css: true,
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
