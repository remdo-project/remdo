import { expect, guardedTest as test, setExpectedConsoleIssues } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { Buffer } from 'node:buffer';
import { DOCKER_TEST_AUTH } from '#tools/docker-test-auth';
import { waitForEditableEditor } from './_support/helpers';
import { homeOrigin, sourceOrigin } from './_support/origins';

// The home derives a source's id from its origin (base64url), same as the server.
const sourceServerId = Buffer.from(sourceOrigin, 'utf8').toString('base64url');
const sourceHost = new URL(sourceOrigin).host;

function buildUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

async function signInWithVisibleForm(page: Page, user: typeof DOCKER_TEST_AUTH): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('links a source by URL and opens its Home document', async ({ page }) => {
  setExpectedConsoleIssues(page, ['Failed to get client token'], { mode: 'allowContains' });

  // Link the source from Sharing. There is no admin registration step and no
  // pre-listed source: entering the URL and clicking "Link source" both
  // self-registers the public client on the source and starts OAuth.
  await page.goto('/sharing');
  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  await page.getByLabel('Source URL').fill(sourceOrigin);
  await page.getByRole('button', { name: 'Link source' }).click();

  // The link starts OAuth on the source. Bob is not pre-signed-in there (no
  // registration step did that for us), so the source most likely shows its
  // login first, then the consent screen; handle both. Each step is a real
  // wait, not a one-shot visibility check that could race the page load.
  await expect.poll(() => new URL(page.url()).origin).toBe(sourceOrigin);
  const loginHeading = page.getByRole('heading', { name: 'Sign in' });
  const consentButton = page.getByRole('button', { name: /allow|authorize|approve|consent/iu });
  await loginHeading.or(consentButton).first().waitFor({ state: 'visible' });
  if (await loginHeading.isVisible()) {
    await signInWithVisibleForm(page, DOCKER_TEST_AUTH);
  }
  await consentButton.waitFor({ state: 'visible' });
  await consentButton.click();

  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  // The linked source now appears under "Linked sources" (a read-only list; the
  // per-source Link button was removed — URL-first is the only link entry).
  await expect(page.getByText('Linked sources')).toBeVisible();
  await expect(page.getByText(sourceOrigin, { exact: true })).toBeVisible();

  // Open the source's Home document from the switcher.
  await page.goto('/');
  await expect(page).toHaveURL(buildUrl(homeOrigin, '/'));

  const switcherTrigger = page.getByRole('button', { name: 'Show documents' });
  await expect(switcherTrigger).toBeVisible();
  await switcherTrigger.click();

  const dropdown = page.locator('.document-header-doc-dropdown');
  await expect(dropdown.getByRole('option', { name: 'Current Server' })).toBeVisible();
  await expect(dropdown.locator(`[data-document-source-id="${sourceServerId}"]`).first()).toContainText(sourceHost);
  await dropdown.locator(`[data-document-source-id="${sourceServerId}"]`).filter({ hasText: /^Home$/ }).click();

  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/n\/[\dA-Za-z]+$/u);
  await waitForEditableEditor(page);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
});
