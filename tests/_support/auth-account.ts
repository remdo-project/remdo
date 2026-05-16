import process from 'node:process';
import { randomUUID } from 'node:crypto';

export const TEST_AUTH_EMAIL_PREFIX = 'remdo-test-';

const authAccountId = `${process.pid}-${Date.now()}-${randomUUID()}`;

export const TEST_AUTH_ACCOUNT = {
  email: `${TEST_AUTH_EMAIL_PREFIX}${authAccountId}@example.com`,
  name: 'Test User',
  password: 'test-password-1234',
} as const;
