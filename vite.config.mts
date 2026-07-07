import { defineConfig } from 'vite';
import { createViteSharedConfig } from './config/vite/shared';

const sharedConfig = createViteSharedConfig();

export default defineConfig({
  ...sharedConfig,
  build: {
    ...sharedConfig.build,
    outDir: "dist",
    assetsDir: "app-assets",
    emptyOutDir: true,
  },
});
