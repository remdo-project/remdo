import { expect, unauthenticatedTest as test } from '#e2e/fixtures';

test.describe('public landing without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const width of [1440, 390]) {
    test(`presents the product and keyboard-accessible entry points at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      await expect(page.getByRole('heading', {
        level: 1,
        name: 'Keyboard-first collaborative outliner',
      })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'From first thought to shared plan' })).toBeVisible();
      await expect(page.getByRole('img', { name: /Tom and Henry collaborate/u })).toBeVisible();
      await expect(page.getByRole('img', { name: /Typing @Atlas opens related notes/u })).toBeVisible();
      await expect(page.getByRole('img', { name: /completed launch note, upcoming tasks/u })).toBeVisible();
      await expect(page.getByLabel('RemDo demo', { exact: true })).toHaveAttribute('controls', '');

      const repository = page.getByRole('link', { name: 'remdo-project/remdo', exact: true });
      const star = page.getByRole('link', { name: /Star (?:us )?on GitHub/u });
      if (width === 1440) {
        await expect(repository).toHaveAttribute('href', 'https://github.com/remdo-project/remdo');
        await expect(star).toHaveAttribute('href', 'https://github.com/remdo-project/remdo');
      }

      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'RemDo home', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      if (width === 1440) {
        await expect(repository).toBeFocused();
        await page.keyboard.press('Tab');
      }
      await expect(page.getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Sign in', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/accounts\/login\/$/u);
      await expect(page.getByLabel('Email:', { exact: true })).toBeVisible();
    });
  }

  test('starts Google sign-in with the native CSRF-protected form', async ({ page }) => {
    await page.route('https://accounts.google.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<h1>Google authorization</h1>',
    }));
    await page.goto('/');

    const submission = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/accounts/google/login/');
    await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    const response = await submission;

    expect(response.status()).toBe(302);
    expect(response.request().method()).toBe('POST');
    expect(new URLSearchParams(response.request().postData()!)
      .get('csrfmiddlewaretoken')).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Google authorization', exact: true })).toBeVisible();
  });
});

test('keeps collaboration, note links, and tasks visible in responsive illustration crops', async ({ page }) => {
  await page.goto('/');
  const collaboration = page.getByRole('img', { name: /Tom and Henry collaborate/u });
  const links = page.getByRole('img', { name: /Typing @Atlas opens related notes/u });
  const tasks = page.getByRole('img', { name: /completed launch note, upcoming tasks/u });

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await collaboration.scrollIntoViewIfNeeded();
    await expect(collaboration.getByText('Tom', { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(collaboration.getByText('Henry', { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(collaboration.getByText('Atlas (launch)', { exact: true })).not.toBeInViewport();

    await links.scrollIntoViewIfNeeded();
    await expect(links.getByText('Atlas launch', { exact: true })).toBeInViewport({ ratio: 0.5 });

    await tasks.scrollIntoViewIfNeeded();
    await expect(tasks.getByText('Draft the launch note', { exact: true })).toBeInViewport({ ratio: 0.5 });
    await expect(tasks.getByText('Add one more idea', { exact: true })).toBeInViewport({ ratio: 0.5 });
  }
});

test('keeps the newsletter preview from submitting an email', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (['document', 'xhr', 'fetch'].includes(request.resourceType()) || request.method() !== 'GET') {
      requests.push(request.url());
    }
  });

  const email = page.getByRole('textbox', { name: 'Your email address', exact: true });
  await email.fill('visitor@example.test');
  await expect(page.getByRole('button', { name: 'Keep me posted', exact: true })).toBeDisabled();
  await email.press('Enter');

  await expect(page).toHaveURL('/');
  await expect(email).toHaveValue('visitor@example.test');
  expect(requests).toEqual([]);
});
