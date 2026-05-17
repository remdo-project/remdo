import process from 'node:process';
import { randomUUID } from 'node:crypto';

export const TEST_AUTH_EMAIL_PREFIX = 'remdo-test-';

const authAccountId = `${process.pid}-${Date.now()}-${randomUUID()}`;

export function createTestAuthAccount(id: string = `${process.pid}-${Date.now()}-${randomUUID()}`) {
  return {
    email: `${TEST_AUTH_EMAIL_PREFIX}${id}@example.com`,
    name: 'Test User',
    password: 'test-password-1234',
  } as const;
}

export const TEST_AUTH_ACCOUNT = createTestAuthAccount(authAccountId);
