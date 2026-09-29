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
    manifest: true,
    rollupOptions: {
      ...sharedConfig.build.rollupOptions,
      input: ['src/client/app/shell/main.tsx', 'src/client/ui/styles/shared.css', 'src/client/ui/landing/faq.tsx'],
    },
    outDir: "dist",
    assetsDir: "app-assets",
    sourcemap: true,
    emptyOutDir: true,
  },
});
