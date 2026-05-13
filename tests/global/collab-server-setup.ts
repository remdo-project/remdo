import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';
import { config } from '../../config';
import { HTTP_STATUS } from '../../lib/http/status';
import { resolveLoopbackHost } from '../../lib/net/loopback';
import { E2E_AUTH_ACCOUNT, E2E_STORAGE_STATE_PATH } from '../e2e/_support/auth-state';
import { ensureCollabServer } from '../../tools/lib/collab-server-helper';
import { ensureRemdoApiServer } from '../../tools/lib/remdo-api-server-helper';

async function createE2EAuthState() {
  const requestHost = resolveLoopbackHost(config.env.HOST);
  const apiContext = await request.newContext({
    baseURL: `http://${requestHost}:${config.env.REMDO_API_PORT}`,
  });

  try {
    const provisionResponse = await apiContext.post('/api/admin/users', {
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
      const signInResponse = await apiContext.post('/api/auth/sign-in/email', {
        data: { email, password },
      });

      if (!signInResponse.ok()) {
        throw new Error(`Failed to sign in e2e user: ${signInResponse.status()} ${signInResponse.statusText()}`);
      }
    }

    fs.mkdirSync(path.dirname(E2E_STORAGE_STATE_PATH), { recursive: true });
    await apiContext.storageState({ path: E2E_STORAGE_STATE_PATH });
  } finally {
    await apiContext.dispose();
  }
}

export default async function collabServerSetup() {
  // eslint-disable-next-line node/no-process-env -- docker E2E uses env-only flag
  if (process.env.E2E_DOCKER === 'true') {
    return;
  }

  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  const stop = await ensureCollabServer({
    port: config.env.COLLAB_SERVER_PORT,
  });
  const stopApi = await ensureRemdoApiServer({
    port: config.env.REMDO_API_PORT,
    ySweetConnectionString: config.env.YSWEET_CONNECTION_STRING,
  });

  const stopServices = async () => {
    await stopApi();
    await stop();
  };

  try {
    await createE2EAuthState();
  } catch (error) {
    await stopServices();
    throw error;
  }

  return stopServices;
}
