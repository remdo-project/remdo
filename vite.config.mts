import { defineConfig } from 'vite';
import { createViteLogger } from './config/_internal/vite/createViteLogger';
import { createViteSharedConfig } from './config/vite/shared';

const sharedConfig = createViteSharedConfig();

export default defineConfig({
  ...sharedConfig,
  customLogger: createViteLogger(),
  build: {
    ...sharedConfig.build,
    outDir: "dist",
    assetsDir: "app-assets",
    emptyOutDir: true,
  },
});
