import { defineConfig } from 'vite';
import { createViteLogger } from './config/_internal/vite/createViteLogger.ts';
import { createViteSharedConfig } from './config/vite/shared.ts';
import { sourceMapUpload } from './config/vite/source-map-upload.ts';

const sharedConfig = createViteSharedConfig();

export default defineConfig(({ command }) => ({
  ...sharedConfig,
  plugins: [
    ...sharedConfig.plugins,
    {
      name: 'remdo-vite-logger',
      configResolved(config) {
        createViteLogger(config.logger);
      },
    },
    sourceMapUpload(command),
  ],
  build: {
    ...sharedConfig.build,
    manifest: true,
    rollupOptions: {
      ...sharedConfig.build.rollupOptions,
      input: ['src/client/app/shell/main.tsx', 'src/client/ui/styles/shared.css', 'src/client/ui/styles/site.css'],
    },
    outDir: "dist",
    assetsDir: "app-assets",
    sourcemap: true,
    emptyOutDir: true,
  },
}));
