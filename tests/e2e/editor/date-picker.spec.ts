import { expect, test } from '#editor/fixtures';
import { setCaretAtText } from '#editor/locators';

// Regression guard for the typeahead insert path (docs/outliner/dates.md).
//
// The `!` typeahead portals the picker panel into Lexical's typeahead anchor,
// which is sized to the trigger glyph (a few px wide). Without an intrinsic
// width the panel collapses to that anchor and the Mantine calendar renders at
// 0px — a visibly broken, unusable picker. This asserts the panel claims its
// natural width in a real browser, where layout actually resolves (jsdom has no
// layout engine, so this cannot be a unit test). It is a non-collapse check, not
// an assertion about any cosmetic value.

test.describe('date picker (docs/outliner/dates.md)', () => {
  test('the ! typeahead picker renders at full width, not collapsed', async ({ page, editor }) => {
    await editor.load('basic');

    // A whitespace boundary before `!` is required to open the typeahead.
    await setCaretAtText(page, 'note1', Number.POSITIVE_INFINITY);
    await page.keyboard.type(' !');

    // The typeahead portals the panel into Lexical's menu anchor on <body>,
    // outside `.editor-container`, so anchor on a calendar day button (which the
    // Mantine picker exposes by accessible name like "<n> <Month> <Year>") rather
    // than an editor-scoped locator. The name regex stays date-independent.
    const dayButton = page.getByRole('button', { name: /^\d+ \w+ \d{4}$/ }).first();
    await expect(dayButton).toBeVisible();

    // Collapsed-anchor regression rendered the picker panel at ~18px; its natural
    // width is ~277px. Measure the [data-date-picker] panel that wraps the day
    // button: anything well above the trigger width proves it is not pinned to the
    // anchor.
    const width = await dayButton.evaluate((el) => {
      const panel = el.closest('[data-date-picker]');
      if (!(panel instanceof HTMLElement)) throw new Error('date picker panel not found');
      return panel.getBoundingClientRect().width;
    });
    expect(width).toBeGreaterThan(150);
  });
});
