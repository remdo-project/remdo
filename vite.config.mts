import { defineConfig } from 'vite';
import { createViteSharedConfig } from './vite.shared';

export default defineConfig({
  ...createViteSharedConfig(),
  build: {
    outDir: "data/dist",
    assetsDir: "app-assets",
    emptyOutDir: true,
  },
});
