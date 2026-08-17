import { expect, test } from '#editor/fixtures';
import { noteRow as row, setCaretAtText } from '#editor/locators';

test.describe('Checked state', () => {
  test('keeps a checked note struck through when open work is moved under it', async ({ page, editor }) => {
    await editor.load('flat');

    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Control+Enter');
    await expect(row(page, 'note2')).toHaveAttribute('data-note-checked', 'true');

    // Indenting an unchecked note under the checked one must not undo it.
    await setCaretAtText(page, 'note3', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Tab');

    await expect(row(page, 'note2')).toHaveAttribute('data-note-checked', 'true');
    // One live witness that the attribute really paints the strikethrough.
    const decoration = await row(page, 'note2')
      .evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(decoration).toContain('line-through');

    // The subtree now holds open work, so note2 marks it and note3 is dimmed
    // relative to an unrelated note that is not under anything checked.
    await expect(row(page, 'note2')).toHaveAttribute('data-note-subtree', 'mixed');
    const colorOf = (label: string) =>
      row(page, label).evaluate((el) => getComputedStyle(el).color);
    expect(await colorOf('note3')).not.toBe(await colorOf('note1'));

    // Toggling completes the subtree: the mixed marking clears and note3, now
    // checked in its own right, stops reading as open work.
    await setCaretAtText(page, 'note2', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Control+Enter');
    await expect(row(page, 'note2')).not.toHaveAttribute('data-note-subtree', 'mixed');
    await expect(row(page, 'note3')).toHaveAttribute('data-note-checked', 'true');
    expect(await colorOf('note3')).toBe(await colorOf('note1'));
  });

  test('exposes the mixed state to assistive technology on a check list', async ({ page, editor }) => {
    await editor.load('tree-list-types');

    // A check-type list gives its notes the checkbox role and aria-checked.
    await expect(row(page, 'note4')).toHaveAttribute('role', 'checkbox');

    await setCaretAtText(page, 'note4', Number.POSITIVE_INFINITY);
    await page.keyboard.press('Control+Enter');
    await expect(row(page, 'note4')).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('child');
    await page.keyboard.press('Tab');

    await expect(row(page, 'note4')).toHaveAttribute('aria-checked', 'mixed');
  });
});
