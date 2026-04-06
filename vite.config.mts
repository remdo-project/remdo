import { defineConfig } from 'vite';
import { createViteSharedConfig } from './vite.shared';

const sharedConfig = createViteSharedConfig();

export default defineConfig({
  ...sharedConfig,
  build: {
    ...sharedConfig.build,
    outDir: "data/dist",
    assetsDir: "app-assets",
    emptyOutDir: true,
  },
});
