import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "#env";
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      hmr: {
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
        "#env": path.resolve(__dirname, "./config/env.server.ts"),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/unit/utils/setup.ts',
      include: ['tests/**/*.spec.{ts,tsx}'],
      css: true,
      coverage: {
        provider: 'v8' as const,
        reportsDirectory: 'data/coverage',
      },
      open: false,
    }
  }
});
