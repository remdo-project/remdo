import path from 'node:path';
import process from 'node:process';

export const E2E_AUTH_ACCOUNT = {
  email: 'e2e@example.com',
  name: 'E2E User',
  password: 'e2e-password-1234',
} as const;

// eslint-disable-next-line node/no-process-env -- loaded by Playwright config before Vite aliases exist
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');

export const E2E_AUTH_STATE_PATH = path.join(
  dataDir,
  'test-results',
  'playwright',
  'e2e-auth-state.json',
);
