/* eslint-disable prefer-rest-params */
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { PluginOption, defineConfig } from "vite";
import moduleResolution from './lexical/packages/shared/viteModuleResolution';
import { env } from "./config/env.server";

export default defineConfig(({ command }) => {
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

    define: {
      __DEV__: true,
    },

    //TODO copied from lexical playground
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
      react(),
      visualizer({
        filename: "data/stats.html",
      }) as unknown as PluginOption,
    ],
    //resolve: {
    //  alias: moduleResolution,
    //},
    resolve: {
      alias: [
      // Ensure subpath aliases resolve before the package root alias
      {
        find: "@lexical/list/utils",
        replacement: path.resolve(
          "./lexical/packages/lexical-list/src/utils.ts"
        ),
      },
      {
        find: "@lexical/list/formatList",
        replacement: path.resolve(
          "./lexical/packages/lexical-list/src/formatList.ts"
        ),
      },
      ...moduleResolution(command === 'serve' ? 'source' : 'development'),
      {
        find: "@",
        replacement: path.resolve("./src"),
      },
      {
        find: "@lexical/LexicalUpdates",
        replacement: path.resolve(
          "./lexical/packages/lexical/src/LexicalUpdates.ts"
        ),
      },
      ]
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
      },
      api: {
        strictPort: true,
        host: "0.0.0.0",
      },
      css: true,
    },
  };
});
