/* eslint-disable prefer-rest-params */
import babel from "@rollup/plugin-babel";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import ufo from "ufo";
import { PluginOption, defineConfig } from "vite";
import Terminal from "vite-plugin-terminal";

// TODO copied from lexical playground vite config + duplicated with tsconfig

const moduleResolution = [
  {
    find: /lexical$/,
    replacement: path.resolve("../lexical/src/index.ts"),
  },
  {
    find: "@lexical/shared/invariant",
    replacement: path.resolve("../shared/src/invariant.ts"),
  },
  {
    find: "@lexical/clipboard",
    replacement: path.resolve("../lexical-clipboard/src/index.ts"),
  },
  {
    find: "@lexical/selection",
    replacement: path.resolve("../lexical-selection/src/index.ts"),
  },
  {
    find: "@lexical/text",
    replacement: path.resolve("../lexical-text/src/index.ts"),
  },
  {
    find: "@lexical/headless",
    replacement: path.resolve("../lexical-headless/src/index.ts"),
  },
  {
    find: "@lexical/html",
    replacement: path.resolve("../lexical-html/src/index.ts"),
  },
  {
    find: "@lexical/hashtag",
    replacement: path.resolve("../lexical-hashtag/src/index.ts"),
  },
  {
    find: "@lexical/history",
    replacement: path.resolve("../lexical-history/src/index.ts"),
  },
  {
    find: "@lexical/list",
    replacement: path.resolve("../lexical-list/src/index.ts"),
  },
  {
    find: "@lexical/file",
    replacement: path.resolve("../lexical-file/src/index.ts"),
  },
  {
    find: "@lexical/table",
    replacement: path.resolve("../lexical-table/src/index.ts"),
  },
  {
    find: "@lexical/offset",
    replacement: path.resolve("../lexical-offset/src/index.ts"),
  },
  {
    find: "@lexical/utils",
    replacement: path.resolve("../lexical-utils/src/index.ts"),
  },
  {
    find: "@lexical/code",
    replacement: path.resolve("../lexical-code/src/index.ts"),
  },
  {
    find: "@lexical/plain-text",
    replacement: path.resolve("../lexical-plain-text/src/index.ts"),
  },
  {
    find: "@lexical/rich-text",
    replacement: path.resolve("../lexical-rich-text/src/index.ts"),
  },
  {
    find: "@lexical/dragon",
    replacement: path.resolve("../lexical-dragon/src/index.ts"),
  },
  {
    find: "@lexical/link",
    replacement: path.resolve("../lexical-link/src/index.ts"),
  },
  {
    find: "@lexical/overflow",
    replacement: path.resolve("../lexical-overflow/src/index.ts"),
  },
  {
    find: "@lexical/markdown",
    replacement: path.resolve("../lexical-markdown/src/index.ts"),
  },
  {
    find: "@lexical/mark",
    replacement: path.resolve("../lexical-mark/src/index.ts"),
  },
  {
    find: "@lexical/yjs",
    replacement: path.resolve("../lexical-yjs/src/index.ts"),
  },
  {
    find: "shared",
    replacement: path.resolve("../shared/src"),
  },
];
// Lexical React
[
  "LexicalTreeView",
  "LexicalComposer",
  "LexicalComposerContext",
  "useLexicalIsTextContentEmpty",
  "useLexicalTextEntity",
  "useLexicalSubscription",
  "useLexicalEditable",
  "LexicalContentEditable",
  "LexicalNestedComposer",
  "LexicalHorizontalRuleNode",
  "LexicalDecoratorBlockNode",
  "LexicalBlockWithAlignableContents",
  "useLexicalNodeSelection",
  "LexicalMarkdownShortcutPlugin",
  "LexicalCharacterLimitPlugin",
  "LexicalHashtagPlugin",
  "LexicalErrorBoundary",
  "LexicalPlainTextPlugin",
  "LexicalRichTextPlugin",
  "LexicalClearEditorPlugin",
  "LexicalCollaborationContext",
  "LexicalCollaborationPlugin",
  "LexicalHistoryPlugin",
  "LexicalTypeaheadMenuPlugin",
  "LexicalTablePlugin",
  "LexicalLinkPlugin",
  "LexicalListPlugin",
  "LexicalCheckListPlugin",
  "LexicalAutoFocusPlugin",
  "LexicalTableOfContents__EXPERIMENTAL",
  "LexicalAutoLinkPlugin",
  "LexicalAutoEmbedPlugin",
  "LexicalOnChangePlugin",
  "LexicalNodeEventPlugin",
].forEach(module => {
  let resolvedPath = path.resolve(`../lexical-react/src/${module}.ts`);

  if (fs.existsSync(resolvedPath)) {
    moduleResolution.push({
      find: `@lexical/react/${module}`,
      replacement: resolvedPath,
    });
  } else {
    resolvedPath = path.resolve(`../lexical-react/src/${module}.tsx`);
    moduleResolution.push({
      find: `@lexical/react/${module}`,
      replacement: resolvedPath,
    });
  }
});

/* END OF COPIED CONTENT */

//playground vite configuration contains a lot of module replacements
//the idea is to reuse them after adjusting to a different dir structure
const playgroundResolveAlias = moduleResolution.map(module => {
  //playground is nested in lexical/packages while this file exist outside
  //of lexical dir structure, let's change this
  let resolvedPath = module.replacement.replace(
    path.resolve(".."),
    path.resolve("./lexical/packages")
  );
  if (!fs.existsSync(resolvedPath)) {
    //playground config replaces .ts to .tsx whenever react/*.ts file
    //doesn't exist, the problem is that this check is done before we
    //have a chance to adjust the dir structure (see above), that's why
    //some of this replacements have to be reverted
    resolvedPath = resolvedPath.replace(".tsx", ".ts");
  }
  return {
    find: module.find,
    replacement: resolvedPath,
  };
});

//finally let's add some missing entries
//do it at the beginning of the array so they take the priority
playgroundResolveAlias.unshift(
  {
    find: "@lexical/playground",
    replacement: path.resolve("./lexical/packages/lexical-playground/src"),
  },
  {
    find: "@lexical/react/LexicalTabIndentationPlugin",
    replacement: path.resolve(
      "./lexical/packages/lexical-react/src/LexicalTabIndentationPlugin.tsx"
    ),
  },
  {
    find: "@lexical/react/shared/useYjsCollaboration",
    replacement: path.resolve(
      "./lexical/packages/lexical-react/src/shared/useYjsCollaboration.tsx"
    ),
  },
  {
    find: "@lexical/list/utils",
    replacement: path.resolve("./lexical/packages/lexical-list/src/utils.ts"),
  },
  {
    find: "@lexical/LexicalConstants",
    replacement: path.resolve(
      "./lexical/packages/lexical/src/LexicalConstants.ts"
    ),
  },
  {
    find: "@lexical/LexicalUpdates",
    replacement: path.resolve(
      "./lexical/packages/lexical/src/LexicalUpdates.ts"
    ),
  },
  {
    find: "@lexical/LexicalUtils",
    replacement: path.resolve("./lexical/packages/lexical/src/LexicalUtils.ts"),
  },
  {
    find: "@lexical/LexicalNode",
    replacement: path.resolve("./lexical/packages/lexical/src/LexicalNode.ts"),
  },
  {
    find: "@lexical/list/formatList",
    replacement: path.resolve(
      "./lexical/packages/lexical-list/src/formatList.ts"
    ),
  },
  {
    find: "@",
    replacement: path.resolve("./src"),
  }
);

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

export default defineConfig({
  server: {
    port: getPort({
      page: 3010,
      vitest_preview: 3001,
      playwright: process.env.PORT,
    }),
    hmr: {
      port: getPort({ page: 3003, vitest_preview: 3004, playwright: null }),
    },
  },

  define: {
    __DEV__: true,
  },

  watch: {
    clearScreen: false,
  },

  //TODO copied from lexical playground
  plugins: [
    false && {
      name: "terminal-patch",
      configureServer(server) {
        server.middlewares.use("/__terminal", (req, res, next) => {
          //replace host with a dot in logs from the browser
          //the idea is to change file paths clickable in the terminal
          const regexp = new RegExp(
            `(http|https)://${req.headers.host}/(.*?)(\\?.*?)?(:[0-9]*:[0-9]*)`,
            "g"
          );
          req.url = req.url.replaceAll(regexp, "./$2$4");

          try {
            const { pathname, search } = ufo.parseURL(req.url);
            const searchParams = new URLSearchParams(search.slice(1));
            const message = decodeURI(searchParams.get("m") ?? "")
              .split("\n")
              .join("\n  ");

            next();
          } catch (e) {
            console.log(e);
            res.end();
          }
        });
      },
    },
    Terminal(/*{ console: "terminal" }*/),
    //@ts-ignore
    babel({
      babelHelpers: "bundled",
      babelrc: false,
      configFile: false,
      exclude: "/**/node_modules/**",
      extensions: ["jsx", "js", "ts", "tsx", "mjs"],
      plugins: [
        "@babel/plugin-transform-flow-strip-types",
        [
          require("./lexical/scripts/error-codes/transform-error-messages"),
          {
            noMinify: true,
          },
        ],
      ],
      presets: ["@babel/preset-react"],
    }),
    react(),
    visualizer({
      filename: "data/stats.html",
    }) as unknown as PluginOption,
  ],
  resolve: {
    alias: playgroundResolveAlias,
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
    threads: !process.env.VITE_DISABLECOLLAB,
    api: {
      strictPort: true,
      port: getPort({ page: null, vitest_preview: 3007, playwright: null }),
      host: "0.0.0.0",
    },
    css: true,
  },
});
