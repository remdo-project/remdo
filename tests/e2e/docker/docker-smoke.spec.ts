import { expect, test } from '#e2e/fixtures';
import { config } from '#config';
import type { ClientToken } from '@y-sweet/sdk';
import { HTTP_STATUS } from '#platform/http/status';
import { request as playwrightRequest } from '@playwright/test';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import * as Y from 'yjs';
import { waitForEditableEditor } from './_support/helpers';

const USER_DATA_ROOT_NOTE_ID = 'user-data';
const DOCUMENTS_KEY = 'documents';
const FORGED_USER_DATA_DOCUMENT_ID = 'forgedUserDataDoc';

interface CurrentUserBootstrapResponse {
  userDataDocumentId: string;
  homeDocumentId: string;
}

interface UserDocumentResponse {
  id: string;
  title: string;
}

function readSmokeDocumentId(): string {
  // eslint-disable-next-line node/no-process-env -- Docker tests consume setup-created smoke document state.
  const smokeDocumentIdPath = process.env.E2E_SMOKE_DOCUMENT_ID;
  if (!smokeDocumentIdPath) {
    throw new Error('E2E_SMOKE_DOCUMENT_ID is required for Docker smoke tests.');
  }
  return fs.readFileSync(smokeDocumentIdPath, 'utf8').trim();
}

function createDocEndpoint(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${path}`;
  return url.toString();
}

function createServerDocEndpoint(baseUrl: string, path: string): string {
  const url = new URL(createDocEndpoint(baseUrl, path));
  url.search = '';
  return url.toString();
}

function createForgedUserDataUpdate(): Uint8Array {
  const doc = new Y.Doc();
  try {
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_DATA_ROOT_NOTE_ID);
    const documents = new Y.Array<Y.Map<unknown>>();
    const entry = new Y.Map<unknown>();
    entry.set('id', FORGED_USER_DATA_DOCUMENT_ID);
    entry.set('title', 'Forged User Data Entry');
    documents.insert(0, [entry]);
    root.set(DOCUMENTS_KEY, documents);
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

function readProjectedDocumentIds(update: Uint8Array): string[] {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    const root = doc.getMap<Y.Array<Y.Map<unknown>>>(USER_DATA_ROOT_NOTE_ID);
    const documents = root.get(DOCUMENTS_KEY);
    if (!(documents instanceof Y.Array)) {
      return [];
    }
    return documents
      .toArray()
      .map((entry) => entry.get('id'))
      .filter((id): id is string => typeof id === 'string');
  } finally {
    doc.destroy();
  }
}

test('user can enter notes and see them rendered', async ({ page }) => {
  // Docker smoke runs against the prod build where the dev TestBridge is absent,
  // so we seed content via real typing instead of fixture loads.
  const smokeDocumentId = readSmokeDocumentId();
  await page.goto(`/n/${smokeDocumentId}`);
  await waitForEditableEditor(page);
  const editorInput = page.locator('.editor-input').first();
  await editorInput.click();

  await page.keyboard.type('note1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('note2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('note3');

  const listItems = page.locator('li.list-item');
  await expect(listItems.filter({ hasText: /note1/ })).toHaveCount(1);
  await expect(listItems.filter({ hasText: /note2/ })).toHaveCount(1);
  await expect(listItems.filter({ hasText: /note3/ })).toHaveCount(1);

  const shell = page.locator('.document-editor-shell').first();
  await expect(shell.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
});

test('token issuance requires auth and collaboration control routes are not routed through the gateway', async ({ page }) => {
  const smokeDocumentId = readSmokeDocumentId();
  await page.goto(`/n/${smokeDocumentId}`);
  const gatewayOrigin = new URL(page.url()).origin;
  const unauthenticatedContext = await playwrightRequest.newContext({
    baseURL: gatewayOrigin,
    ignoreHTTPSErrors: true,
    storageState: {
      cookies: [],
      origins: [],
    },
  });
  const unauthenticatedTokenResponse = await unauthenticatedContext.fetch(`/api/documents/${smokeDocumentId}/sync-tokens`, {
    method: 'POST',
    failOnStatusCode: false,
  });
  const unauthenticatedTokenStatus = unauthenticatedTokenResponse.status();
  await unauthenticatedContext.dispose();

  expect(unauthenticatedTokenStatus).toBe(HTTP_STATUS.UNAUTHORIZED);
  const authenticatedTokenStatus = await page.evaluate(async (docId) => {
    const response = await fetch(`/api/documents/${docId}/sync-tokens`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{}',
    });
    return response.status;
  }, smokeDocumentId);
  expect(authenticatedTokenStatus).toBe(HTTP_STATUS.OK);

  const newRouteResponse = await page.context().request.fetch(`${gatewayOrigin}/doc/new`, {
    method: 'POST',
    failOnStatusCode: false,
  });
  const authRouteResponse = await page.context().request.fetch(`${gatewayOrigin}/doc/main/auth`, {
    method: 'POST',
    failOnStatusCode: false,
  });

  expect(newRouteResponse.status()).toBe(HTTP_STATUS.NOT_FOUND);
  expect(authRouteResponse.status()).toBe(HTTP_STATUS.NOT_FOUND);
});

test('user data sync token is read-only and API document creation updates the projection', async ({ page }) => {
  await page.goto(`/n/${readSmokeDocumentId()}`);
  const requestContext = page.context().request;

  const bootstrapResponse = await requestContext.fetch('/api/current-user');
  expect(bootstrapResponse.status()).toBe(HTTP_STATUS.OK);
  const bootstrap = await bootstrapResponse.json() as CurrentUserBootstrapResponse;

  const tokenResponse = await requestContext.fetch(`/api/documents/${bootstrap.userDataDocumentId}/sync-tokens`, {
    method: 'POST',
    failOnStatusCode: false,
  });
  expect(tokenResponse.status()).toBe(HTTP_STATUS.OK);
  const token = await tokenResponse.json() as ClientToken;
  expect(token.authorization).toBe('read-only');

  const writeResponse = await requestContext.fetch(createDocEndpoint(token.baseUrl, 'update'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.token}`,
      'content-type': 'application/octet-stream',
    },
    data: Buffer.from(createForgedUserDataUpdate()),
    failOnStatusCode: false,
  });
  expect(writeResponse.status()).toBe(HTTP_STATUS.FORBIDDEN);

  const createResponse = await requestContext.fetch('/api/documents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    data: {
      title: 'Docker Projection Document',
    },
  });
  expect(createResponse.status()).toBe(HTTP_STATUS.OK);
  const createdDocument = await createResponse.json() as UserDocumentResponse;

  await expect.poll(async () => {
    const updateResponse = await requestContext.fetch(createServerDocEndpoint(token.baseUrl, 'as-update'), {
      headers: {
        authorization: `Bearer ${config.env.YSWEET_SERVER_TOKEN}`,
      },
    });
    expect(updateResponse.status()).toBe(HTTP_STATUS.OK);
    return readProjectedDocumentIds(new Uint8Array(await updateResponse.body()));
  }).toEqual(expect.arrayContaining([bootstrap.homeDocumentId, createdDocument.id]));

  const finalUpdateResponse = await requestContext.fetch(createServerDocEndpoint(token.baseUrl, 'as-update'), {
    headers: {
      authorization: `Bearer ${config.env.YSWEET_SERVER_TOKEN}`,
    },
  });
  expect(finalUpdateResponse.status()).toBe(HTTP_STATUS.OK);
  expect(readProjectedDocumentIds(new Uint8Array(await finalUpdateResponse.body()))).not.toContain(
    FORGED_USER_DATA_DOCUMENT_ID,
  );
});
