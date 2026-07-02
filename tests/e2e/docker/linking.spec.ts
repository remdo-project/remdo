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

// The Docker session is the home admin (setup.spec enrolled it); register the
// source through the /admin panel, authorizing on the source as the same person.
async function registerSource(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page).toHaveURL(buildUrl(homeOrigin, '/admin'));
  await expect(page.getByRole('heading', { name: 'Source servers' })).toBeVisible();

  await page.getByLabel('Source server URL').fill(sourceOrigin);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(sourceHost, { exact: true })).toBeVisible();
  await expect(page.getByText('Not registered')).toBeVisible();

  // Register redirects to the source's confirmation page (top-level nav).
  await page.getByRole('button', { name: 'Register', exact: true }).click();

  // Not yet signed in on the source → its login, then back to the confirmation.
  await expect.poll(() => new URL(page.url()).origin).toBe(sourceOrigin);
  await signInWithVisibleForm(page, STABLE_AUTH_USERS.bob);
  await expect(page.getByRole('heading', { name: 'Register a home server' })).toBeVisible();
  await page.getByRole('button', { name: 'Authorize' }).click();

  // Back on the home /admin with the pending claim; finish registration.
  await expect.poll(() => new URL(page.url()).origin).toBe(new URL(homeOrigin).origin);
  await page.getByRole('button', { name: 'Finish registering this home' }).click();
  await expect(page.getByText('Registered', { exact: true })).toBeVisible();
}

test('registers a source, links an account, and opens its Home document', async ({ page }) => {
  setExpectedConsoleIssues(page, ['Failed to get client token'], { mode: 'allowContains' });

  await registerSource(page);

  // Link the source account from Sharing.
  await page.goto('/sharing');
  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  await expect(page.getByText('Remote RemDo servers')).toBeVisible();
  await expect(page.getByText(sourceHost, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Link' }).click();

  // The link starts OAuth on the source. Bob is already signed in there from
  // registration, so the source may skip its login and go straight to consent
  // (or auto-approve). Handle a login form and a consent screen if they appear.
  await expect.poll(() => new URL(page.url()).origin).toBe(sourceOrigin);
  if (await page.getByRole('heading', { name: 'Sign in' }).isVisible().catch(() => false)) {
    await signInWithVisibleForm(page, STABLE_AUTH_USERS.bob);
  }
  const consentButton = page.getByRole('button', { name: /allow|authorize|approve|consent/iu });
  if (await consentButton.isVisible().catch(() => false)) {
    await consentButton.click();
  }

  await expect(page).toHaveURL(buildUrl(homeOrigin, '/sharing'));
  await expect(page.getByRole('button', { name: 'Linked' })).toBeVisible();

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
