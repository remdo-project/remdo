import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { config } from '../../../config';
import { HTTP_STATUS } from '../../../lib/http/status';
import { cleanupTestAuthData } from '../../global/test-auth-cleanup';
import { E2E_AUTH_ACCOUNT, E2E_STORAGE_STATE_PATH } from '../_support/auth-state';

test('authenticate e2e account', async ({ request }) => {
  cleanupTestAuthData();

  const provisionResponse = await request.post('/api/admin/users', {
    data: {
      ...E2E_AUTH_ACCOUNT,
      adminSecret: config.env.ADMIN_SECRET,
    },
  });

  if (!provisionResponse.ok() && provisionResponse.status() !== HTTP_STATUS.UNPROCESSABLE_ENTITY) {
    throw new Error(`Failed to provision e2e user: ${provisionResponse.status()} ${provisionResponse.statusText()}`);
  }

  if (provisionResponse.status() === HTTP_STATUS.UNPROCESSABLE_ENTITY) {
    const { email, password } = E2E_AUTH_ACCOUNT;
    const signInResponse = await request.post('/api/auth/sign-in/email', {
      data: { email, password },
    });

    if (!signInResponse.ok()) {
      throw new Error(`Failed to sign in e2e user: ${signInResponse.status()} ${signInResponse.statusText()}`);
    }
  }

  fs.mkdirSync(path.dirname(E2E_STORAGE_STATE_PATH), { recursive: true });
  await request.storageState({ path: E2E_STORAGE_STATE_PATH });
});
