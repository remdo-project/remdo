import { expect, test } from '#e2e/fixtures';
import { loginThroughTinyauthIfNeeded, waitForEditableEditor } from './_support/helpers';

const DOCKER_SMOKE_DOC_ID = 'dockerSmoke';

test('user can enter notes and see them rendered', async ({ page }) => {
  // Docker smoke runs against the prod build where the dev TestBridge is absent,
  // so we seed content via real typing instead of fixture loads.
  await page.goto(`/n/${DOCKER_SMOKE_DOC_ID}`);
  await loginThroughTinyauthIfNeeded(page);
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

test('collaboration control routes are not routed through the gateway', async ({ page }) => {
  await page.goto(`/n/${DOCKER_SMOKE_DOC_ID}`);
  await loginThroughTinyauthIfNeeded(page);

  const gatewayOrigin = new URL(page.url()).origin;
  const newRouteResponse = await page.context().request.fetch(`${gatewayOrigin}/doc/new`, {
    method: 'POST',
    failOnStatusCode: false,
  });
  const authRouteResponse = await page.context().request.fetch(`${gatewayOrigin}/doc/main/auth`, {
    method: 'POST',
    failOnStatusCode: false,
  });

  expect(newRouteResponse.status()).toBe(404);
  expect(authRouteResponse.status()).toBe(404);
});
