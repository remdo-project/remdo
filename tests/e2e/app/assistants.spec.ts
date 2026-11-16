import { expect, unauthenticatedTest as test } from '#e2e/fixtures';

const demoName = 'A ChatGPT conversation about a travel app is saved to RemDo as an outline.';

test('offers the published ChatGPT plugin and prefilled Claude connector from the landing page', async ({ page }) => {
  await page.goto('/');
  const assistants = page.getByRole('tablist', { name: 'Choose your assistant' });
  await assistants.getByRole('tab', { name: 'ChatGPT', exact: true }).click();
  const chatgpt = page.getByRole('link', { name: 'Add RemDo to ChatGPT', exact: true });
  await expect(chatgpt).toHaveAttribute('href', 'https://chatgpt.com/plugins/plugin_asdk_app_6ac660fbb52c81918e101590babd0473');
  await expect(chatgpt).toHaveAttribute('target', '_blank');

  const claudeTab = assistants.getByRole('tab', { name: 'Claude', exact: true });
  await claudeTab.click();
  await expect(claudeTab).toHaveAttribute('aria-selected', 'true');
  const claude = page.getByRole('link', { name: 'Add RemDo to Claude', exact: true });
  await expect(claude).toHaveAttribute('href', 'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=RemDo&connectorUrl=https%3A%2F%2Fremdo.com%2Fmcp');
  await expect(claude).toHaveAttribute('target', '_blank');
  await expect(chatgpt).toBeHidden();
});

for (const name of ['Perplexity', 'Gemini', 'Grok']) {
  test(`opens the ${name} guide directly from its landing invitation`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name, exact: true }).click();
    await page.getByRole('link', { name: `Add RemDo to ${name}`, exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/docs/mcp/\\?assistant=${name.toLowerCase()}$`, 'u'));
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Connected apps', exact: true })).toHaveAttribute('href', '/accounts/connected-apps/');
  });
}

test('keeps guide selection in its URL through keyboard navigation, history and reload', async ({ page }) => {
  await page.goto('/docs/mcp/?assistant=gemini');
  const gemini = page.getByRole('tab', { name: 'Gemini', exact: true });
  await expect(page.getByRole('tabpanel', { name: 'Gemini', exact: true })).toBeVisible();
  await gemini.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Grok', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Grok', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?assistant=grok$/u);

  await page.goBack();
  await expect(gemini).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Gemini', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('tabpanel', { name: 'Grok', exact: true })).toBeVisible();
  await page.reload();
  const grok = page.getByRole('tab', { name: 'Grok', exact: true });
  await expect(grok).toHaveAttribute('aria-selected', 'true');
  await grok.focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'ChatGPT', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'ChatGPT', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(grok).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'ChatGPT', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(grok).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
});

test('copies usable server and terminal values from the selected guide', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/mcp/?assistant=claude');
  const copyServer = page.getByRole('button', { name: 'Copy RemDo server URL', exact: true });
  await copyServer.click();
  await expect(copyServer).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://remdo.com/mcp');

  await page.getByRole('button', { name: 'Copy Claude Code command', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('claude mcp add --transport http remdo https://remdo.com/mcp');
  await page.getByRole('tab', { name: 'ChatGPT', exact: true }).click();
  await page.getByRole('button', { name: 'Copy Codex command', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('codex mcp add remdo --url https://remdo.com/mcp');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps ordinary assistant links and readable setup instructions available', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Choose your assistant' }).getByRole('link', { name: 'Gemini', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/mcp\/\?assistant=gemini$/u);
    for (const name of ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText('https://remdo.com/mcp', { exact: true })).toHaveCount(5);
    await expect(page.getByRole('button', { name: /Copy/u })).toHaveCount(0);
  });
});

for (const width of [390, 1440]) {
  test(`keeps the final outline and connection controls usable with reduced motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
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

    await page.getByRole('tab', { name: 'Claude', exact: true }).click();
    await page.getByRole('link', { name: 'Add RemDo to Claude', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Add RemDo to Claude', exact: true })).toBeInViewport();

    await page.goto('/docs/mcp/?assistant=claude');
    const copy = page.getByRole('button', { name: 'Copy Claude Code command', exact: true });
    await copy.scrollIntoViewIfNeeded();
    await expect(copy).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.getByRole('tab', { name: 'Gemini', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Gemini', exact: true })).toContainText('Custom apps');
  });
}

test('starts the chat on scroll, pauses offscreen, and replays only after the completed outline leaves', async ({ page }) => {
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
