import path from "node:path";
import process from "node:process";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import { env } from "#env";

export default defineConfig(({ command }) => {
  const enableFastRefresh = command === 'serve' && process.env.VITE_ENABLE_FAST_REFRESH !== 'false';
  return {
    server: {
      allowedHosts: true,
      port: env.PORT,
      hmr: {
        port: env.PORT + 1,
      },
      watch: {
        ignored: ["data/**"],
      },
    },

    plugins: [
      {
        name: "log-requests",
        configureServer(server) {
          server.middlewares.use((req, _, next) => {
            console.warn(`Request: ${req.method} ${req.url}`);
            next();
          });
        },
      },
      react({
        fastRefresh: enableFastRefresh,
      }),
      visualizer({
        filename: "data/stats.html",
      }) as unknown as PluginOption,
    ],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve("./src"),
        },
        {
          find: "#env",
          replacement: path.resolve("./config/env.server.ts"),
        },
      ],
    },
    build: {
      outDir: "data/build",
      rollupOptions: {
        input: {
          main: "./index.html",
        },
      },
    },
    test: {
      globalSetup: ['./tests/global-setup.ts'],
      include: [
        "tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
        "test/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      ],
      environment: "jsdom",
      open: false,
      coverage: {
        provider: "v8",
        reportsDirectory: "data/coverage",
        exclude: [
          "lexical/**",
          "tests/**",
          "types/**",
          "vite.config.*",
        ],
        include: ["src/**"],
        reporter: ["text-summary", "html", "lcov"],
        enabled: !env.VITE_PERFORMANCE_TESTS,
      },
      css: true,
    },
  };
});
