import { expect, test } from '#editor/fixtures';
import { setCaretAtText } from '#editor/locators';

// Regression guards for the `!` date picker (docs/outliner/dates.md and the
// shared trigger lifecycle in docs/outliner/triggers.md). These need a real
// browser: width depends on layout (jsdom has none), and the reopen guard
// depends on caret navigation across rendered text.

const anyDayButton = /^\d+ \w+ \d{4}$/;

test.describe('date picker (docs/outliner/dates.md)', () => {
  test('the ! picker renders at full width, not collapsed', async ({ page, editor }) => {
    await editor.load('basic');

    // A whitespace boundary before `!` is required to open the picker.
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' !');

    // The picker portals onto <body>, outside `.editor-container`, so anchor on a
    // calendar day button (exposed by accessible name like "<n> <Month> <Year>")
    // rather than an editor-scoped locator. The name regex stays date-independent.
    const dayButton = page.getByRole('button', { name: anyDayButton }).first();
    await expect(dayButton).toBeVisible();

    // A collapsed-anchor regression rendered the panel at ~18px; its natural
    // width is ~277px. Anything well above the trigger width proves it is not
    // pinned to the anchor.
    const width = await dayButton.evaluate((el) => {
      const panel = el.closest('[data-date-picker]');
      if (!(panel instanceof HTMLElement)) throw new Error('date picker panel not found');
      return panel.getBoundingClientRect().width;
    });
    expect(width).toBeGreaterThan(150);
  });

  test('the ! picker does not reopen when the caret returns beside an existing !', async ({ page, editor }) => {
    await editor.load('basic');

    // Picker presence is detected via a calendar day button (the picker portals
    // outside `.editor-container`, so use a role locator, not page.locator).
    const dayButton = page.getByRole('button', { name: anyDayButton }).first();

    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' !');
    await expect(dayButton).toBeVisible();

    // Escape keeps the `!` as text and closes the picker.
    await page.keyboard.press('Escape');
    await expect(dayButton).toHaveCount(0);

    // Move the caret off the `!` and back beside it: it must stay closed.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(dayButton).toHaveCount(0);
  });
});
