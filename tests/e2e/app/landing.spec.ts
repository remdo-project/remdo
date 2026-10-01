import type { Locator, Page } from '@playwright/test';
import { expect, unauthenticatedTest as test } from '#e2e/fixtures';

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

test('sign-in shows its story beside the form on wide screens and drops it on narrower ones', async ({ page }) => {
  await page.goto('/accounts/login/');
  const story = page.getByText('A place for your next thought.', { exact: true });
  const google = page.getByRole('button', { name: 'Sign in with Google' });
  const email = page.getByLabel('Email:', { exact: true });
  const signInLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Sign in', exact: true });

  for (const [width, beside] of [[1440, true], [1024, true], [768, false], [390, false]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    if (beside) await expect(story).toBeVisible();
    else await expect(story).toBeHidden();
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

test('reveals a FAQ answer when its question is activated', async ({ page }) => {
  await page.goto('/');
  const question = page.getByText('Can I use RemDo offline?', { exact: true });
  const answer = page.getByText(/if you have a remembered session/u);

  await expect(answer).toBeHidden();
  await question.click();
  await expect(answer).toBeVisible();
  await question.click();
  await expect(answer).toBeHidden();
});
