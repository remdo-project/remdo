import type { Locator, Page } from '@playwright/test';
import { expect, unauthenticatedTest as test } from '#e2e/fixtures';

for (const width of [390, 1440]) {
  test(`saves a product update request through the native form at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const signup = page.getByRole('form', { name: 'Hear about the big steps.' });
    const status = page.getByRole('region', { name: 'What works today and what comes next' });
    await expect(status.locator(':scope > div').last().getByRole('form')).toHaveCount(1);
    const email = signup.getByRole('textbox', { name: 'Your email address' });
    await expect(page.locator('#landing-signup').getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy/');
    await email.fill(`landing-${width}@example.test`);
    await email.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Thanks for your interest. Your request has been saved.');
    await expect(page).toHaveURL(/\/keep-me-posted\/\?saved=1#landing-signup$/u);
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();

    await email.fill(`landing-${width}@example.test`);
    await signup.getByRole('button', { name: 'Keep me posted' }).click();
    await expect(page.getByRole('status')).toHaveText('Thanks for your interest. Your request has been saved.');
  });
}

test('associates server validation with the email field and allows correcting it', async ({ page }) => {
  await page.goto('/');
  const signup = page.getByRole('form', { name: 'Hear about the big steps.' });
  await signup.evaluate((element: HTMLFormElement) => { element.noValidate = true; });
  await signup.getByRole('textbox', { name: 'Your email address' }).fill('not-an-email');
  await signup.getByRole('button', { name: 'Keep me posted' }).click();

  const email = page.getByRole('textbox', { name: 'Your email address' });
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveValue('not-an-email');
  await email.fill('corrected-landing@example.test');
  await email.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Thanks for your interest. Your request has been saved.');
  await expect(email).not.toHaveAttribute('aria-invalid', 'true');
});

test('keeps Today / Next after the story and links each invitation to the section and its signup', async ({ page }) => {
  await page.goto('/');
  const story = page.getByRole('region', { name: 'About RemDo' });
  const next = page.getByRole('region', { name: 'What works today and what comes next' });
  const prose = await story.locator(':scope > p').last().boundingBox();
  const block = await next.boundingBox();
  expect(prose!.y + prose!.height).toBeLessThan(block!.y);
  await expect(page.getByRole('form', { name: 'Hear about the big steps.' })).toHaveCount(1);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Keep me posted', 'Waiting for something? Keep me posted']) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(/#landing-signup$/u);
      await expect(next.getByRole('heading', { name: 'Today', exact: true })).toBeInViewport();
      await expect(next.getByRole('heading', { name: 'Next', exact: true })).toBeInViewport();
      await expect(page.getByRole('textbox', { name: 'Your email address' })).toBeInViewport();
    }
  }
});

test('keeps collaboration, note links, and tasks visible in responsive illustration crops', async ({ page }) => {
  await page.goto('/');
  const collaboration = page.getByRole('img', { name: /Tom and Henry collaborate/u });
  const links = page.getByRole('img', { name: /Typing @Atlas opens related notes/u });
  const tasks = page.getByRole('img', { name: /completed launch note, upcoming tasks/u });

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await collaboration.scrollIntoViewIfNeeded();
    await expect(collaboration.getByText('Tom', { exact: true })).toBeInViewport({ ratio: 0.99 });
    await expect(collaboration.getByText('Henry', { exact: true })).toBeInViewport({ ratio: 0.99 });

    await links.scrollIntoViewIfNeeded();
    await expect(links.getByText('Atlas launch', { exact: true })).toBeInViewport({ ratio: 0.5 });

    await tasks.scrollIntoViewIfNeeded();
    await expect(tasks.getByText('Draft the launch note', { exact: true })).toBeInViewport({ ratio: 0.5 });
    await expect(tasks.getByText('Add one more idea', { exact: true })).toBeInViewport({ ratio: 0.5 });
  }
});

test('sign-in shows its story beside the form on wide screens and removes it on narrower ones', async ({ page }) => {
  await page.goto('/accounts/login/');
  const storyPanel = page.getByRole('complementary', { name: 'About RemDo' });
  const story = page.getByText('A place for your next thought.', { exact: true });
  const google = page.getByRole('button', { name: 'Sign in with Google' });
  const email = page.getByLabel('Email:', { exact: true });
  const signInLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sign in', exact: true });

  for (const [width, beside] of [[1440, true], [1024, true], [768, false], [390, false]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    if (beside) {
      await expect(storyPanel).toBeVisible();
      await expect(story).toBeVisible();
    } else {
      await expect(storyPanel).toBeHidden();
      await expect(story).toBeHidden();
    }
    await expect(signInLink).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    expect((await google.boundingBox())!.y).toBeLessThan((await email.boundingBox())!.y);
  }
});

test('places the wordmark at the same spot on every public page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const wordmark = page.getByRole('link', { name: 'RemDo home', exact: true });
  const boxes = [];
  for (const path of ['/', '/privacy/', '/accounts/login/']) {
    await page.goto(path);
    // Positions only: the width changes while DM Sans replaces the fallback font.
    boxes.push(await wordmark.boundingBox().then((box) => box && { x: box.x, y: box.y, height: box.height }));
  }
  expect(boxes[0]).not.toBeNull();
  expect(boxes[1]).toEqual(boxes[0]);
  expect(boxes[2]).toEqual(boxes[0]);
});

test.describe('story text', () => {
  const colorOf = (paragraph: Locator) => paragraph.evaluate((element) => getComputedStyle(element).color);
  const brightnessOf = (color: string) => color.match(/\d+/gu)!.slice(0, 3).map(Number).reduce((sum, channel) => sum + channel, 0);
  const paragraphsOf = (page: Page) => page.getByRole('region', { name: 'About RemDo' }).locator(':scope > p');

  test('brightens as it scrolls into reading position', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const last = paragraphsOf(page).last();

    const unread = brightnessOf(await colorOf(last));
    await last.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect.poll(async () => brightnessOf(await colorOf(last))).toBeGreaterThan(unread);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('shows every paragraph in the same colour', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');

      const colors = await paragraphsOf(page).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color));
      expect(new Set(colors).size).toBe(1);
    });
  });
});

test('reveals at most one FAQ answer at a time and allows closing every answer', async ({ page }) => {
  await page.goto('/');
  const faq = page.getByRole('region', { name: 'Frequently asked questions.' });
  const visibleAnswers = faq.locator('p:visible');

  await expect(faq.locator('summary').first()).toHaveCSS('text-align', 'left');
  await expect(visibleAnswers).toHaveCSS('text-align', 'left');

  await expect(visibleAnswers).toHaveCount(1);
  await expect(visibleAnswers).toContainText('The outliner works today');
  await faq.getByText('Is RemDo still in early development?', { exact: true }).click();
  await expect(visibleAnswers).toHaveCount(0);

  for (const question of await faq.locator('summary').all()) {
    await question.click();
    await expect(visibleAnswers).toHaveCount(1);
    await expect(question.locator('..').getByRole('paragraph')).toBeVisible();
  }

  const offline = faq.getByText('Can I use RemDo offline?', { exact: true });
  const collaboration = faq.getByText('Can I work with other people?', { exact: true });
  await offline.focus();
  await page.keyboard.press('Enter');
  await expect(visibleAnswers).toHaveCount(1);
  await expect(visibleAnswers).toContainText('if you have a remembered session');
  await collaboration.focus();
  await page.keyboard.press('Space');
  await expect(visibleAnswers).toHaveCount(1);
  await expect(visibleAnswers).toContainText('Document owners can share');
  await expect(collaboration).toBeFocused();
  await page.keyboard.press('Space');
  await expect(visibleAnswers).toHaveCount(0);
});

test.describe('home video', () => {
  const surface = { position: { x: 16, y: 16 } };

  test('starts from a click anywhere on it and then offers the browser controls', async ({ page }) => {
    await page.goto('/');
    const video = page.getByLabel('RemDo demo');

    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Watch demo', exact: true })).toBeVisible();
    await expect(video).toHaveJSProperty('controls', false);
    await video.click(surface);

    await expect(video).toHaveJSProperty('paused', false);
    await expect(video).toHaveJSProperty('controls', true);
    await expect(page.getByRole('button', { name: 'Watch demo', exact: true })).toBeHidden();
  });

  for (const width of [390, 1440]) {
    test(`reveals the play halo across the video area and on keyboard focus at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const video = page.getByLabel('RemDo demo');
      const play = page.getByRole('button', { name: 'Watch demo', exact: true });
      const haloOpacity = () => play.evaluate((element) => getComputedStyle(element, '::before').opacity);

      await expect(play).toBeVisible();
      await expect.poll(haloOpacity).toBe('0');
      await video.hover(surface);
      await expect.poll(haloOpacity).toBe('1');
      await expect(video).toHaveJSProperty('paused', true);

      await page.getByRole('heading', { level: 1 }).hover();
      await expect.poll(haloOpacity).toBe('0');
      await play.focus();
      await expect.poll(haloOpacity).toBe('1');
      await expect(play).toBeFocused();
    });
  }

  test('shows the play button again while paused and resumes from it', async ({ page }) => {
    await page.goto('/');
    const video = page.getByLabel('RemDo demo');
    const play = page.getByRole('button', { name: 'Watch demo', exact: true });

    await video.click(surface);
    await expect(video).toHaveJSProperty('paused', false);
    await video.click(surface);
    await expect(video).toHaveJSProperty('paused', true);
    await expect(play).toBeVisible();

    await play.click();
    await expect(video).toHaveJSProperty('paused', false);
    await expect(play).toBeHidden();
  });

  test('hands keyboard focus to the video when the play button starts it', async ({ page }) => {
    await page.goto('/');
    const video = page.getByLabel('RemDo demo');

    await page.getByRole('button', { name: 'Watch demo', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(video).toBeFocused();
    await page.keyboard.press('Space');

    await expect(video).toHaveJSProperty('paused', true);
  });
});
