import { defineConfig } from 'vite';
import { createViteLogger } from './config/_internal/vite/createViteLogger.ts';
import { createViteSharedConfig } from './config/vite/shared.ts';

const sharedConfig = createViteSharedConfig();

export default defineConfig({
  ...sharedConfig,
  plugins: [
    ...sharedConfig.plugins,
    {
      name: 'remdo-vite-logger',
      configResolved(config) {
        createViteLogger(config.logger);
      },
    },
  ],
  build: {
    ...sharedConfig.build,
    outDir: "dist",
    assetsDir: "app-assets",
    emptyOutDir: true,
  },
});
