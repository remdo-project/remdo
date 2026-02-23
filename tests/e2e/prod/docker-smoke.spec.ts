import { expect, test } from '#e2e/fixtures';
import { loginThroughTinyauthIfNeeded } from './_support/helpers';

const DOCKER_SMOKE_DOC_ID = 'dockerSmoke';

test('user can enter notes and see them rendered', async ({ page }) => {
  // Docker smoke runs against the prod build where the dev TestBridge is absent,
  // so we seed content via real typing instead of fixture loads.
  await page.goto(`/n/${DOCKER_SMOKE_DOC_ID}`);
  await loginThroughTinyauthIfNeeded(page);
  const editorInput = page.locator('.editor-input').first();
  await editorInput.waitFor({ state: 'visible' });
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
