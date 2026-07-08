import { expect, setExpectedConsoleIssues, test } from '#e2e/fixtures';
import type { Page } from '#e2e/fixtures';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { config } from '#config';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { waitForEditableEditor } from './_support/helpers';

// The source's single origin, shared by the container home and the browser (see
// playwright.docker.config.ts). The home derives the source id from it.
// eslint-disable-next-line node/no-process-env -- the Docker runner sets the source origin.
const sourceOrigin = process.env.REMDO_E2E_SOURCE_ORIGIN ?? `http://localhost:${config.env.PORT}`;
const homeOrigin = config.env.APP_PUBLIC_URL;
// The home derives a source's id from its origin (base64url), same as the server.
const sourceServerId = Buffer.from(sourceOrigin, 'utf8').toString('base64url');
const sourceHost = new URL(sourceOrigin).host;

type StableUser = (typeof STABLE_AUTH_USERS)[keyof typeof STABLE_AUTH_USERS];

function buildUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

async function signInWithVisibleForm(page: Page, user: StableUser): Promise<void> {
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
    await signInWithVisibleForm(page, STABLE_AUTH_USERS.bob);
  }
  await consentButton.waitFor({ state: 'visible' });
  await consentButton.click();

  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  // The linked source now appears under "Linked sources" (a read-only list; the
  // per-source Link button was removed — URL-first is the only link entry).
  await expect(page.getByText('Linked sources')).toBeVisible();
  await expect(page.getByText(sourceOrigin, { exact: true })).toBeVisible();

  // Open the source's Home document from the switcher.
  await page.goto('/home');
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/n\/[\dA-Za-z]+$/u);
  const homePathname = new URL(page.url()).pathname;

  const switcherTrigger = page.getByRole('button', { name: 'Choose document' });
  await expect(switcherTrigger).toBeVisible();
  await switcherTrigger.click();

  const dropdown = page.locator('.document-header-doc-dropdown');
  await expect(dropdown.locator('[data-document-source-id="local"]')).toContainText('Current Server');
  const sourceGroup = dropdown.locator(`[data-document-source-id="${sourceServerId}"]`);
  await expect(sourceGroup).toContainText(sourceHost);
  await sourceGroup.getByRole('option', { name: 'Home', exact: true }).click();

  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/n\/[\dA-Za-z]+$/u);
  expect(new URL(page.url()).pathname).not.toBe(homePathname);
  await waitForEditableEditor(page);
  await expect(page.locator('.collab-status')).toHaveAttribute('aria-label', /Server connected/i);
});
