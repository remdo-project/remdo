import { defineConfig } from "vite";

export default defineConfig(({ }) => {
  return {
    server: {
      host: "0.0.0.0", //TODO don't hardcode
      port: 3010,
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      host: "0.0.0.0",
      strictPort: true,
    },
  }
});
