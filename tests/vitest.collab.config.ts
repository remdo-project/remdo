import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/collab/**/*.spec.ts'],
    setupFiles: ['tests/unit/_support/setup/index.ts', 'tests/unit/_support/setup/collab-local.ts'],
  },
});
