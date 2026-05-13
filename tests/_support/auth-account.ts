import process from 'node:process';

const authAccountId = `${process.pid}-${Date.now()}`;

export const TEST_AUTH_ACCOUNT = {
  email: `test-${authAccountId}@example.com`,
  name: 'Test User',
  password: 'test-password-1234',
} as const;
