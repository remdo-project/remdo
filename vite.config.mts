import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { PluginOption, defineConfig } from "vite";
import { env } from "./config/env.server";

export default defineConfig(({ command }) => {
  //TODO prevent using process.env directly in the code, instead use env from config/env.server.ts
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
            console.log(`Request: ${req.method} ${req.url}`);
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
      include: ["tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
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
        enabled: true,
      },
      css: true,
    },
  };
});
