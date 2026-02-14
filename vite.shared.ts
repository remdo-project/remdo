import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from './config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPreviewSession = config.env.VITEST_PREVIEW;

export function createViteSharedConfig() {
  return {
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
  };
}
