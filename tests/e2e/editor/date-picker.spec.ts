import { expect, test } from '#editor/fixtures';
import {
  datePickerDay,
  datePickerDays,
  datePickerPanel,
  datePickerWeekdays,
  dateTokens,
  setCaretAtText,
} from '#editor/locators';
import type { Page } from '#editor/fixtures';

// Regression guards for the `!` date picker (docs/specs/outliner/dates.md and the
// shared trigger lifecycle in docs/specs/outliner/popups.md). These need a real
// browser: width depends on layout (jsdom has none), the keyboard cases depend on
// real DOM focus, and the reopen guard depends on caret navigation across text.

function anyDay(page: Page) {
  return datePickerDays(page).first();
}

// The ISO date of the currently focused day cell, or null if focus is not on one.
function focusedDay(page: Page) {
  return page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.getAttribute('data-date-picker-day') ?? null);
}

function focusIsInside(page: Page, selector: string) {
  return page.evaluate((sel) => document.activeElement?.closest(sel) != null, selector);
}

// Open the ! picker at the end of note1 and wait for the grid.
async function openInsertPicker(page: Page) {
  // A whitespace boundary before `!` is required to open the picker.
  await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
  await page.keyboard.type(' !');
  await expect(anyDay(page)).toBeVisible();
}

test.describe('date picker (docs/specs/outliner/dates.md)', () => {
  test('the ! picker renders at full width, not collapsed', async ({ page, editor }) => {
    await editor.load('basic');
    await openInsertPicker(page);

    // A collapsed-anchor regression rendered the panel at ~18px; its natural
    // width is well above that. Anything far above the trigger width proves it
    // is not pinned to the anchor.
    const width = await anyDay(page).evaluate((el) => {
      const panel = el.closest('[data-date-picker]');
      if (!(panel instanceof HTMLElement)) throw new Error('date picker panel not found');
      return panel.getBoundingClientRect().width;
    });
    expect(width).toBeGreaterThan(150);
  });

  test('the ! calendar is keyboard-navigable and commits the focused day', async ({ page, editor }) => {
    // The ! picker is a modal calendar dialog: focus moves into the grid, arrow
    // keys navigate days, and Enter commits the focused (not just today's) day.
    await editor.load('basic');
    await openInsertPicker(page);

    // Focus lands on a day cell. Arrow right one day and confirm DOM focus moved
    // to a different day — i.e. the calendar grid owns the arrow keys.
    const before = await focusedDay(page);
    expect(before).not.toBeNull();
    await page.keyboard.press('ArrowRight');
    const after = await focusedDay(page);
    expect(after).not.toBe(before);

    await page.keyboard.press('Enter');
    // The picker closed and a date token for the navigated day was inserted.
    await expect(anyDay(page)).toHaveCount(0);
    await expect(dateTokens(page)).toHaveCount(1);
    // Focus returns to the editor after committing from the trapping calendar, so
    // typing continues in the editor rather than being lost on the unmounted grid.
    expect(await focusIsInside(page, '.editor-input')).toBe(true);
  });

  test('Space commits the focused day', async ({ page, editor }) => {
    // Space is a commit key alongside Enter (docs/specs/outliner/dates.md).
    await editor.load('basic');
    await openInsertPicker(page);

    await page.keyboard.press('ArrowRight');
    const committed = await focusedDay(page);
    await page.keyboard.press('Space');

    await expect(anyDay(page)).toHaveCount(0);
    await expect(dateTokens(page)).toHaveCount(1);
    expect(committed).not.toBeNull();
    expect(await focusIsInside(page, '.editor-input')).toBe(true);
  });

  test('the calendar moves day focus across a month boundary', async ({ page, editor }) => {
    // The gap that retired the previous widget: arrowing off the end of a month
    // must move focus into the adjacent month and page the visible grid with it.
    await editor.load('basic');
    await openInsertPicker(page);

    const start = await focusedDay(page);
    expect(start).not.toBeNull();
    const startMonth = start!.slice(0, 7);

    // Walk forward a day at a time until the month changes. 31 steps always
    // crosses a boundary from any starting day.
    let crossedTo: string | null = null;
    for (let step = 0; step < 31; step += 1) {
      await page.keyboard.press('ArrowRight');
      const current = await focusedDay(page);
      expect(current, `focus left the grid after ${step + 1} ArrowRight press(es)`).not.toBeNull();
      if (current!.slice(0, 7) !== startMonth) {
        crossedTo = current;
        break;
      }
    }

    expect(crossedTo, 'day focus never crossed a month boundary').not.toBeNull();
    // Focus is still on a real, focused day cell in the newly visible month.
    await expect(datePickerDay(page, crossedTo!)).toBeFocused();
  });

  test('Home/End move within the week and PageUp/PageDown page by month and year', async ({ page, editor }) => {
    // The rest of the contract's key set (docs/specs/outliner/dates.md).
    await editor.load('basic');
    await openInsertPicker(page);

    const start = await focusedDay(page);
    expect(start).not.toBeNull();

    // Home then End land on different days of the same week, with End on or
    // after Home.
    await page.keyboard.press('Home');
    const weekStart = await focusedDay(page);
    await page.keyboard.press('End');
    const weekEnd = await focusedDay(page);
    expect(weekStart).not.toBeNull();
    expect(weekEnd).not.toBeNull();
    expect(weekEnd! >= weekStart!).toBe(true);

    // PageDown moves to the next month, PageUp back to the previous one.
    const beforePage = await focusedDay(page);
    await page.keyboard.press('PageDown');
    const nextMonth = await focusedDay(page);
    expect(nextMonth!.slice(0, 7)).not.toBe(beforePage!.slice(0, 7));
    await page.keyboard.press('PageUp');
    expect((await focusedDay(page))!.slice(0, 7)).toBe(beforePage!.slice(0, 7));

    // Shift+PageDown moves by a year.
    const beforeYear = await focusedDay(page);
    await page.keyboard.press('Shift+PageDown');
    const nextYear = await focusedDay(page);
    expect(nextYear!.slice(0, 4)).not.toBe(beforeYear!.slice(0, 4));
  });

  test('the calendar has month chrome and marks today', async ({ page, editor }) => {
    // The calendar owns its chrome: a month/year heading, prev/next controls,
    // weekday headers, and a distinguishable today.
    await editor.load('basic');
    await openInsertPicker(page);

    const panel = datePickerPanel(page);
    await expect(panel.getByRole('heading')).toBeVisible();
    // The month-nav labels come from React Aria's localized strings. Scope to the
    // rendered controls: the library also mounts hidden duplicates for its own
    // month navigation.
    const next = panel.locator('.date-picker-nav', { hasText: '›' });
    const previous = panel.locator('.date-picker-nav', { hasText: '‹' });
    await expect(next).toBeVisible();
    await expect(previous).toBeVisible();
    // Seven localized weekday column headers. They are deliberately aria-hidden
    // (each day cell's accessible name already names its weekday), so this
    // asserts the rendered headers rather than a columnheader role.
    await expect(datePickerWeekdays(page)).toHaveCount(7);
    // Today is marked, and is the day the picker opened on.
    await expect(panel.locator('[data-date-picker-day][data-today]')).toHaveCount(1);

    // The next-month control repaints the grid on a different month.
    const shownMonth = await anyDay(page).getAttribute('data-date-picker-day');
    await next.click();
    const afterMonth = await anyDay(page).getAttribute('data-date-picker-day');
    expect(afterMonth).not.toBe(shownMonth);
  });

  test('Tab in the ! calendar cycles its own controls and never leaves the dialog', async ({ page, editor }) => {
    // The calendar traps focus: Tab moves between the dialog's own controls
    // (month navigation and the grid) and must never escape into browser focus
    // traversal, which would leave the popup open with focus outside it.
    await editor.load('basic');
    await openInsertPicker(page);

    const dayBeforeTabbing = await focusedDay(page);
    expect(dayBeforeTabbing).not.toBeNull();

    // Per the APG grid pattern the whole day grid is a single Tab stop, so the
    // cycle is: previous month, next month, the focused day, and back. A
    // regression that made every day cell tabbable walked Tab through the
    // adjacent month's days one at a time, so this asserts the landing points,
    // not merely that focus stayed inside.
    const cycle = [
      'control:Previous',
      'control:Next',
      `day:${dayBeforeTabbing}`,
    ];

    const landings: string[] = [];
    for (let step = 0; step < cycle.length * 2; step += 1) {
      await page.keyboard.press('Tab');
      expect(
        await focusIsInside(page, '[data-date-picker]'),
        `focus left the dialog after ${step + 1} Tab press(es)`,
      ).toBe(true);
      landings.push(await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return 'none';
        return active.dataset.datePickerDay
          ? `day:${active.dataset.datePickerDay}`
          : `control:${active.getAttribute('aria-label')}`;
      }));
    }

    expect(landings).toEqual([...cycle, ...cycle]); // wraps, and only one grid stop

    await expect(anyDay(page)).toBeVisible(); // still open
    await expect(dateTokens(page)).toHaveCount(0); // nothing committed

    // Escape is the only cancel key; it closes and restores the caret.
    await page.keyboard.press('Escape');
    await expect(anyDay(page)).toHaveCount(0);
    expect(await focusIsInside(page, '.editor-input')).toBe(true);
  });

  test('exactly one day cell is in the tab order', async ({ page, editor }) => {
    // The roving tabindex behind the single-Tab-stop grid: the focused day is
    // tabbable and every other cell — including the adjacent months' days, which
    // carry no tabindex at all — must not be.
    await editor.load('basic');
    await openInsertPicker(page);

    const tabbable = await datePickerDays(page).evaluateAll((cells) =>
      cells
        .filter((cell) => cell instanceof HTMLElement && cell.tabIndex >= 0)
        .map((cell) => (cell as HTMLElement).dataset.datePickerDay ?? null));

    expect(tabbable).toEqual([await focusedDay(page)]);
  });

  test('the edit-mode calendar (clicking a date) is keyboard-navigable and commits', async ({ page, editor }) => {
    // Clicking a committed date opens the same focus-trapping calendar; arrow keys
    // navigate and Enter commits the changed date, then focus returns to the editor.
    await editor.load('basic');
    await openInsertPicker(page);
    await page.keyboard.press('Enter'); // insert today
    const token = dateTokens(page);
    await expect(token).toHaveCount(1);
    const originalLabel = (await token.textContent())?.trim();

    // Click the token → edit-mode calendar opens with focus in the grid.
    await token.click();
    await expect(anyDay(page)).toBeVisible();
    expect(await focusedDay(page)).not.toBeNull();

    // Navigate to another day and commit; the token's date changed and focus is
    // back in the editor.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(anyDay(page)).toHaveCount(0);
    await expect(token).toHaveCount(1);
    expect((await token.textContent())?.trim()).not.toBe(originalLabel);
    expect(await focusIsInside(page, '.editor-input')).toBe(true);
  });

  test('Escape in the edit-mode calendar leaves the date unchanged and restores focus', async ({ page, editor }) => {
    await editor.load('basic');
    await openInsertPicker(page);
    await page.keyboard.press('Enter');
    const token = dateTokens(page);
    const originalLabel = (await token.textContent())?.trim();

    await token.click();
    await expect(anyDay(page)).toBeVisible();

    // Navigate then Escape: the change is discarded and focus returns to the editor.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(anyDay(page)).toHaveCount(0);
    expect((await token.textContent())?.trim()).toBe(originalLabel);
    expect(await focusIsInside(page, '.editor-input')).toBe(true);
  });

  test('the ! picker does not reopen when the caret returns beside an existing !', async ({ page, editor }) => {
    await editor.load('basic');
    await openInsertPicker(page);

    // Escape keeps the `!` as text and closes the picker.
    await page.keyboard.press('Escape');
    await expect(anyDay(page)).toHaveCount(0);

    // Move the caret off the `!` and back beside it: it must stay closed.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(anyDay(page)).toHaveCount(0);
  });
});
