/* eslint-disable prefer-rest-params */
import babel from "@rollup/plugin-babel";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { PluginOption, defineConfig } from "vite";
import moduleResolution from './lexical/packages/shared/viteModuleResolution';


function getPort({ page, vitest_preview, playwright }) {
  const modes = ["page", "vitest_preview", "playwright"];
  const mode = process.env.SERVER_MODE || "page";

  if (!modes.includes(mode)) {
    throw Error(`Invalid server mode: ${mode}, should be one of ${modes}`);
  }
  const port = arguments[0][mode];
  if (port === undefined) {
    //null is fine, means that we don't need that port for a given scenario
    throw Error(
      `Wrong config args: ${JSON.stringify(arguments["0"])} mode: ${mode}`
    );
  }
  return port;
}

export default defineConfig(({ command }) => {
  return {
    server: {
      port: getPort({
        page: 3010,
        vitest_preview: 3001,
        playwright: process.env.PORT,
      }),
      hmr: {
        port: getPort({ page: 3003, vitest_preview: 3004, playwright: null }),
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
      //@ts-ignore
      babel({
        babelHelpers: "bundled",
        babelrc: false,
        configFile: false,
        exclude: "/**/node_modules/**",
        extensions: ["jsx", "js", "ts", "tsx", "mjs"],
        presets: ["@babel/preset-react"],
      }),
      react(),
      visualizer({
        filename: "data/stats.html",
      }) as unknown as PluginOption,
    ],
    //resolve: {
    //  alias: moduleResolution,
    //},
    resolve: {
      alias: [...moduleResolution(command === 'serve' ? 'source' : 'development'),
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
        port: getPort({ page: null, vitest_preview: 3007, playwright: null }),
        host: "0.0.0.0",
      },
      css: true,
    },
  };
});
