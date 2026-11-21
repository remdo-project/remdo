import { expect, unauthenticatedTest as test } from '#e2e/fixtures';

const demoName = 'A ChatGPT conversation about a travel app is saved to RemDo as an outline.';
const chatgptUrl = 'https://chatgpt.com/plugins/plugin_asdk_app_6ac660fbb52c81918e101590babd0473';
const claudeUrl = 'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=RemDo&connectorUrl=https%3A%2F%2Fremdo.com%2Fmcp';

test('offers the existing ChatGPT and Claude connections among three landing choices', async ({ page }) => {
  await page.goto('/');
  const assistants = page.getByRole('tablist', { name: 'Choose your assistant' });
  await expect(assistants.getByRole('tab')).toHaveText(['ChatGPT', 'Claude', 'Other assistants']);
  const chatgpt = page.getByRole('link', { name: 'Add RemDo to ChatGPT', exact: true });
  await expect(chatgpt).toHaveAttribute('href', chatgptUrl);
  await expect(chatgpt).toHaveAttribute('target', '_blank');

  await assistants.getByRole('tab', { name: 'Claude', exact: true }).click();
  const claude = page.getByRole('link', { name: 'Add RemDo to Claude', exact: true });
  await expect(claude).toHaveAttribute('href', claudeUrl);
  await expect(claude).toHaveAttribute('target', '_blank');
  await expect(chatgpt).toBeHidden();
  await assistants.getByRole('tab', { name: 'ChatGPT', exact: true }).click();
  await expect(chatgpt).toBeVisible();
  await expect(claude).toBeHidden();
});

test('selects landing assistants by keyboard and opens the existing MCP guide for Other assistants', async ({ page }) => {
  await page.goto('/');
  const assistants = page.getByRole('tablist', { name: 'Choose your assistant' });
  const chatgpt = assistants.getByRole('tab', { name: 'ChatGPT', exact: true });
  const claude = assistants.getByRole('tab', { name: 'Claude', exact: true });
  const other = assistants.getByRole('tab', { name: 'Other assistants', exact: true });
  await chatgpt.focus();
  await page.keyboard.press('ArrowRight');
  await expect(claude).toBeFocused();
  await expect(page.getByRole('link', { name: 'Add RemDo to Claude', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(other).toBeFocused();
  await expect(page.getByRole('link', { name: 'Connect another assistant', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(chatgpt).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(other).toBeFocused();
  await page.keyboard.press('Home');
  await expect(chatgpt).toBeFocused();
  await expect(chatgpt).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  await other.click();
  const guide = page.getByRole('link', { name: 'Connect another assistant', exact: true });
  await expect(guide).toHaveAttribute('href', '/docs/mcp/');
  await guide.click();
  await expect(page).toHaveURL(/\/docs\/mcp\/$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Connect an AI assistant', exact: true })).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps the three landing choices as direct connection links', async ({ page }) => {
    await page.goto('/');
    const assistants = page.getByRole('navigation', { name: 'Choose your assistant' });
    await expect(assistants.getByRole('link')).toHaveText(['ChatGPT', 'Claude', 'Other assistants']);
    await expect(assistants.getByRole('link', { name: 'ChatGPT', exact: true })).toHaveAttribute('href', chatgptUrl);
    await expect(assistants.getByRole('link', { name: 'Claude', exact: true })).toHaveAttribute('href', claudeUrl);
    const other = assistants.getByRole('link', { name: 'Other assistants', exact: true });
    await expect(other).toHaveAttribute('href', '/docs/mcp/');
    await other.click();
    await expect(page).toHaveURL(/\/docs\/mcp\/$/u);
    await expect(page.getByRole('heading', { level: 1, name: 'Connect an AI assistant', exact: true })).toBeVisible();
  });
});

for (const width of [390, 1440]) {
  test(`keeps the landing outline and three connection choices usable with reduced motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const demo = page.getByRole('img', { name: demoName });
    await demo.scrollIntoViewIfNeeded();
    const outline = demo.locator('.landing-assistant-remdo-card');
    await expect(outline).toHaveCSS('opacity', '1');
    await expect(demo.locator('.landing-assistant-chat-card')).toHaveCSS('opacity', '0');
    await expect(outline.getByText('Improve the flow from their feedback', { exact: true })).toBeInViewport();
    const demoBox = (await demo.boundingBox())!;
    expect(demoBox.x).toBeGreaterThanOrEqual(0);
    expect(demoBox.x + demoBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    const assistants = page.getByRole('tablist', { name: 'Choose your assistant' });
    await assistants.scrollIntoViewIfNeeded();
    for (const name of ['ChatGPT', 'Claude', 'Other assistants']) {
      await expect(assistants.getByRole('tab', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    await assistants.getByRole('tab', { name: 'Other assistants', exact: true }).click();
    const guide = page.getByRole('link', { name: 'Connect another assistant', exact: true });
    await guide.scrollIntoViewIfNeeded();
    await expect(guide).toBeInViewport({ ratio: 1 });
  });
}

test('starts the landing chat on scroll, pauses offscreen, and replays after the completed outline leaves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: new Date('2026-11-16T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-16T12:00:01Z'));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const demo = page.getByRole('img', { name: demoName });
  const draft = demo.locator('.landing-assistant-draft');
  const saved = demo.locator('.landing-assistant-saved-text');
  const outline = demo.locator('.landing-assistant-remdo-card');
  const scrollToDemo = async () => {
    await demo.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    // Wait for the native visibility observation before advancing the paused animation clock.
    await expect(demo).toBeInViewport({ ratio: 1 });
  };
  const scrollAway = async () => {
    await page.getByRole('heading', { level: 1 }).evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(demo).not.toBeInViewport();
  };

  await page.clock.runFor(10_000);
  await expect(draft).toBeEmpty();
  await expect(outline).toHaveCSS('opacity', '0');
  await scrollToDemo();
  await page.clock.runFor(2400);
  await expect(draft).toContainText('Save');
  await expect(draft).not.toHaveText('Save this to @RemDo');

  await scrollAway();
  await page.clock.runFor(32);
  const pausedDraft = await draft.textContent();
  await page.clock.runFor(10_000);
  await expect(draft).toHaveText(pausedDraft!);
  await scrollToDemo();
  await page.clock.runFor(1500);
  await expect(demo.locator('.landing-assistant-save-message')).toHaveCSS('opacity', '1');
  await expect(saved).toContainText('Saved');
  await expect(saved).not.toHaveText('Saved as Building a travel app in RemDo.');
  await page.clock.runFor(1500);
  await expect(saved).toHaveText('Saved as Building a travel app in RemDo.');
  await page.clock.runFor(2500);
  await expect(outline).toHaveCSS('opacity', '1');
  await page.clock.runFor(10_000);
  await expect(outline).toHaveCSS('opacity', '1');

  await scrollAway();
  await page.clock.runFor(32);
  await scrollToDemo();
  await page.clock.runFor(32);
  await expect(outline).toHaveCSS('opacity', '0');
  await expect(saved).toBeEmpty();
  await page.clock.runFor(2400);
  await expect(draft).toContainText('Save');
});
