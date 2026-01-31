import { expect, test } from '#e2e/fixtures';
import { config } from '#config';
import { editorLocator } from '#editor/locators';
import { ensureReady } from '#editor/bridge';

const DOCKER_SMOKE_DOC_ID = 'docker-smoke';

test('user can enter notes and see them rendered', async ({ page }) => {
  // Docker smoke runs against the prod build where the dev TestBridge is absent,
  // so we seed content via real typing instead of fixture loads. In dev/test runs
  // clear the shared doc first to avoid duplicate notes.
  await page.goto(`/n/${DOCKER_SMOKE_DOC_ID}`);
  if (config.isDevOrTest) {
    await ensureReady(page, { clear: true });
  }

  const editorInput = editorLocator(page).locator('.editor-input').first();
  await editorInput.waitFor({ state: 'visible' });
  await editorInput.click();

  await page.keyboard.type('note1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('note2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('note3');

  const listItems = editorLocator(page).locator('li.list-item');
  await expect(listItems.filter({ hasText: /note1/ })).toHaveCount(1);
  await expect(listItems.filter({ hasText: /note2/ })).toHaveCount(1);
  await expect(listItems.filter({ hasText: /note3/ })).toHaveCount(1);

  await expect(editorLocator(page).locator('.collab-status')).toHaveAttribute('aria-label', 'Live');
});
