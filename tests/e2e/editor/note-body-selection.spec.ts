import type { Page } from '#editor/fixtures';
import { expect, test } from '#editor/fixtures';
import { editorLocator, setCaretAtText } from '#editor/locators';

// Pointer selection contract for note bodies (docs/outliner/body.md "Selection
// and navigation"): a note's content and its body are two distinct regions. A
// shift-click within one region stays inline; a shift-click crossing regions —
// content ↔ its own body, or into another note — is a structural selection.
//
// These run in a real browser because the thing under test is the native
// pointer → caret-at-coordinate path: a Shift+Click resolves the click point to
// a caret and extends the selection there. The unit suite covers the same model
// decision via Selection.extend; here we drive it through a real click.

async function addBody(page: Page, noteLabel: string, bodyText: string) {
  await setCaretAtText(page, noteLabel, Number.POSITIVE_INFINITY);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type(bodyText);
}

/** Shift+Click the middle of the first text node whose content includes `label`. */
async function shiftClickText(page: Page, label: string) {
  const text = editorLocator(page).locator('[data-lexical-text="true"]').filter({ hasText: label }).first();
  const box = (await text.boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up('Shift');
}

function input(page: Page) {
  return editorLocator(page).locator('.editor-input').first();
}

test.describe('note body pointer selection contract (docs/outliner/body.md)', () => {
  test('Shift+Click from a note into its own body is structural', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'bodyone');

    await setCaretAtText(page, 'note1', 0);
    await shiftClickText(page, 'bodyone');

    await expect(input(page)).toHaveClass(/editor-input--structural/);
  });

  test('Shift+Click from a note into ANOTHER note body is structural', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note2', 'bodytwo');

    await setCaretAtText(page, 'note1', 0);
    await shiftClickText(page, 'bodytwo');

    await expect(input(page)).toHaveClass(/editor-input--structural/);
  });

  test('Shift+Click from a body back into its own note is structural', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'bodyone');

    await setCaretAtText(page, 'bodyone', 0);
    await shiftClickText(page, 'note1');

    await expect(input(page)).toHaveClass(/editor-input--structural/);
  });

  test('Shift+Click from one body into ANOTHER body is structural', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note1', 'bodyone');
    await addBody(page, 'note2', 'bodytwo');

    await setCaretAtText(page, 'bodyone', 0);
    await shiftClickText(page, 'bodytwo');

    await expect(input(page)).toHaveClass(/editor-input--structural/);
  });

  test('Shift+Click extends a pre-existing structural selection into a later note body', async ({ page, editor }) => {
    await editor.load('flat');
    await addBody(page, 'note3', 'bodythree');

    // Build a structural note1..note2 selection, then Shift+Click into note3's body.
    await setCaretAtText(page, 'note1', 0);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(input(page)).toHaveClass(/editor-input--structural/);

    await shiftClickText(page, 'bodythree');
    await expect(input(page)).toHaveClass(/editor-input--structural/);
  });
});
