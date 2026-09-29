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
    await page.getByRole('region', { name: 'Keyboard-first collaborative outliner' })
      .getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    const response = await submission;

    expect(response.status()).toBe(302);
    expect(response.request().method()).toBe('POST');
    expect(new URLSearchParams(response.request().postData()!)
      .get('csrfmiddlewaretoken')).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Google authorization', exact: true })).toBeVisible();
  });
});

test('opens one FAQ answer at a time and allows closing all answers', async ({ page }) => {
  await page.goto('/');
  const faq = page.getByRole('region', { name: 'Frequently asked questions' });
  const first = faq.getByRole('button', { name: 'Is RemDo still in early development?' });
  const offline = faq.getByRole('button', { name: 'Can I use RemDo offline?' });
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await offline.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(offline).toHaveAttribute('aria-expanded', 'true');
  await expect(faq.getByText(/Yes, if RemDo remembers your session/u)).toBeVisible();
  await offline.press('Space');
  await expect(offline).toHaveAttribute('aria-expanded', 'false');
  await expect(faq.getByRole('group')).toHaveCount(0);
});

test('reveals a stationary ending on desktop and mobile, with an accessible flow fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/');
  const ending = page.locator('.landing-ending');
  const faq = page.getByRole('region', { name: 'Frequently asked questions' });
  const legal = page.getByRole('navigation', { name: 'Footer', exact: true });
  const lastQuestion = faq.getByRole('button', { name: 'Does RemDo connect to email and calendars?' });

  for (const viewport of [{ width: 1440, height: 950 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(ending).toHaveAttribute('data-reveal-mode', 'curtain');
    await lastQuestion.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('region', { name: 'Try RemDo now' })
      .getByRole('button', { name: 'Sign in with Google', exact: true })).toBeFocused();
    await expect(legal.getByRole('link', { name: 'Terms', exact: true })).toBeInViewport({ ratio: 1 });
    const before = await ending.boundingBox();
    await page.mouse.wheel(0, -150);
    await expect.poll(async () => (await ending.boundingBox())?.y).toBe(before!.y);
  }

  await page.setViewportSize({ width: 1280, height: 680 });
  await expect(ending).toHaveAttribute('data-reveal-mode', 'flow');
  await legal.scrollIntoViewIfNeeded();
  await expect(legal.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(ending).toHaveAttribute('data-reveal-mode', 'flow');
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

test('shows connector examples through desktop controls and the mobile stack', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const demo = page.getByRole('region', { name: 'Claude connector walkthrough' });
  await expect(demo.getByRole('heading', { name: 'Connect RemDo to Claude' })).toBeVisible();
  await demo.getByRole('button', { name: '02 Ask' }).click();
  await expect(demo.getByRole('heading', { name: 'Start with your own context.' })).toBeVisible();
  await demo.getByRole('button', { name: '02 Ask' }).press('End');
  await expect(demo.getByRole('heading', { name: 'Continue in RemDo.' })).toBeVisible();
  await expect(demo.getByText('Project summary', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(demo.getByRole('group', { name: 'Claude connector steps' })).toBeHidden();
  await demo.getByRole('button', { name: 'Next example: Connect' }).click();
  await expect(demo.getByRole('heading', { name: 'Connect RemDo to Claude' })).toBeVisible();
  await demo.getByRole('button', { name: 'Next example: Ask' }).press('ArrowRight');
  await expect(demo.getByRole('button', { name: 'Next example: Review' })).toBeFocused();
  await demo.getByRole('button', { name: 'Next example: Review' }).click();
  await expect(demo.getByText('Launch on October 2.', { exact: true })).toBeVisible();
});
