import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { env } from "#env";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ }) => {
  return {
    server: {
      host: env.HOST,
      port: env.PORT,
      strictPort: true,
      allowedHosts: true,
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
  }
});
