import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

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

  test('the ! calendar is keyboard-navigable and commits the focused day', async ({ page, editor }) => {
    // The ! picker is a modal calendar dialog: focus moves into the grid, arrow
    // keys navigate days, and Enter commits the focused (not just today's) day.
    // This is browser-only — jsdom has no focus or native caret.
    await editor.load('basic');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' !');

    // Focus lands on a day cell (a button). Read the focused day, arrow right one
    // day, and confirm the DOM focus moved to a different day — i.e. the calendar
    // grid owns the arrow keys.
    const dayButton = page.getByRole('button', { name: anyDayButton }).first();
    await expect(dayButton).toBeVisible();
    const beforeIso = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.getAttribute('data-date-picker-day') ?? null);
    await page.keyboard.press('ArrowRight');
    const afterIso = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.getAttribute('data-date-picker-day') ?? null);
    expect(beforeIso).not.toBeNull();
    expect(afterIso).not.toBe(beforeIso); // the grid moved focus by a day

    await page.keyboard.press('Enter');
    // The picker closed and a date token for the navigated day was inserted.
    await expect(dayButton).toHaveCount(0);
    await expect(editorLocator(page).locator('[data-date-node-key]')).toHaveCount(1);
  });

  test('Tab in the ! calendar closes it and returns focus to the editor', async ({ page, editor }) => {
    // The calendar traps focus; Tab must not escape into browser focus traversal
    // (which would leave the popup open with focus outside it). It cancels and
    // returns focus to the editor, inserting no date. Browser-only (needs focus).
    await editor.load('basic');
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' !');

    const dayButton = page.getByRole('button', { name: anyDayButton }).first();
    await expect(dayButton).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(dayButton).toHaveCount(0); // closed
    await expect(editorLocator(page).locator('[data-date-node-key]')).toHaveCount(0); // no date inserted
    // Focus is back in the editor.
    const focusInEditor = await page.evaluate(() =>
      document.activeElement?.closest('.editor-input') !== null);
    expect(focusInEditor).toBe(true);
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
