import { expect, test } from '#e2e/fixtures';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createUserDocument } from '../_support/documents';
import {
  DOCKER_TEST_ADMIN_SECRET,
  DOCKER_TEST_AUTH,
  waitForEditableEditor,
  waitForServiceWorkerControl,
} from './_support/helpers';

test('admin self-enrollment creates the first admin and can open the editor', async ({ page }) => {
  const staleDocumentPath = '/n/staleDocBeforeEnroll';

  await page.goto(staleDocumentPath);

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Become admin' }).click();
  await expect(page.getByRole('heading', { name: 'Become admin' })).toBeVisible();
  await page.fill('input[autocomplete="current-password"]', DOCKER_TEST_ADMIN_SECRET);
  await page.fill('input[autocomplete="name"]', DOCKER_TEST_AUTH.name);
  await page.fill('input[autocomplete="email"]', DOCKER_TEST_AUTH.email);
  await page.fill('input[autocomplete="new-password"]', DOCKER_TEST_AUTH.password);
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();

  await page.goto('/home');
  await page.waitForURL(/\/n\//u);
  await waitForEditableEditor(page);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
  await waitForServiceWorkerControl(page);
  await waitForEditableEditor(page);

  const smokeDocument = await createUserDocument(page, 'Docker Smoke');
  // eslint-disable-next-line node/no-process-env -- Docker setup shares the created smoke document id.
  const smokeDocumentIdPath = process.env.E2E_WRITE_SMOKE_DOCUMENT_ID;
  if (smokeDocumentIdPath) {
    fs.mkdirSync(path.dirname(smokeDocumentIdPath), { recursive: true });
    fs.writeFileSync(smokeDocumentIdPath, `${smokeDocument.id}\n`, 'utf8');
  }

  // eslint-disable-next-line node/no-process-env -- Docker setup writes auth state for the remaining specs.
  const storageStatePath = process.env.E2E_WRITE_STORAGE_STATE;
  if (storageStatePath) {
    await page.context().storageState({ path: storageStatePath });
  }
});
