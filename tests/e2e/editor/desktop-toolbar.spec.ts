import { expect, test } from '#editor/fixtures';
import type { Page } from '#editor/fixtures';
import { clearZoom, editorLocator, homeZoomBreadcrumb, noteRow, selectInlineRange, setCaretAtText } from '#editor/locators';
import { waitForSynced } from '#editor/bridge';
import { createEditorDocumentPath } from './_support/routes';

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Document editing' });
const input = (page: Page) => editorLocator(page).locator('.editor-input');

for (const width of [1280, 390]) {
  test(`places the toolbar beside or below both location titles at ${width}px`, async ({ page, editor }) => {
    await page.setViewportSize({ width, height: 900 });
    await editor.load('tree-complex');

    const checkLayout = async (firstChild: string) => {
      await expect(toolbar(page)).toBeVisible();
      await expect(toolbar(page)).toHaveCount(1);
      await expect.poll(() => toolbar(page).evaluate((element, { firstChild, width }) => {
        const title = document.querySelector('.location-header-title, [data-zoom-root]')!;
        const text = document.createRange();
        text.selectNodeContents(title);
        const titleRect = text.getBoundingClientRect();
        const bar = element.getBoundingClientRect();
        const child = Array.from(document.querySelectorAll('li.list-item:not(.list-nested-item)'))
          .find(row => row.textContent === firstChild)!.getBoundingClientRect();
        const correctPlacement = width === 1280
          ? titleRect.right < bar.left && titleRect.top < bar.bottom && bar.top < titleRect.bottom
          : titleRect.bottom <= bar.top;
        return {
          correctPlacement,
          aboveChild: child.height > 0 && bar.bottom <= child.top,
          pageWidth: document.documentElement.scrollWidth,
        };
      }, { firstChild, width })).toEqual({ correctPlacement: true, aboveChild: true, pageWidth: width });
    };
    const checkControls = async () => {
      await expect.poll(() => page.evaluate(() => {
        const child = Array.from(document.querySelectorAll('li.list-item:not(.list-nested-item)'))
          .find(row => row.textContent === 'note3')!.getBoundingClientRect();
        const control = document.querySelector('.note-controls__button--menu')!.getBoundingClientRect();
        const center = control.top + control.height / 2;
        return center > child.top && center < child.bottom;
      })).toBe(true);
    };

    await checkLayout('note1');
    await page.goto(createEditorDocumentPath(editor.docId, 'note2'));
    await waitForSynced(page);
    await checkLayout('note3');
    await setCaretAtText(page, 'note3');

    // Editing a wrapping rich title must keep the controls clear of its text
    // and children; shrinking it and leaving zoom must release the space.
    const longTitle = 'A title that stays editable while the toolbar sits beside it. '.repeat(4);
    await page.evaluate(async text => {
      await globalThis.__remdoTestBridges!.list()[0]!.updateNoteText('note2', text);
    }, longTitle);
    await expect(input(page).locator('[data-zoom-root]')).toHaveText(longTitle);
    await checkLayout('note3');
    await checkControls();
    await page.evaluate(async () => {
      await globalThis.__remdoTestBridges!.list()[0]!.updateNoteText('note2', 'note2');
    });
    await expect(input(page).locator('[data-zoom-root]')).toHaveText('note2');
    await checkLayout('note3');
    await checkControls();
    await clearZoom(page);
    await checkLayout('note1');
  });
}

test('keeps the desktop controls visible at a caret and suppresses the floating presentation', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note2', 2);
  await expect(toolbar(page)).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
  await selectInlineRange(page, 'note2', 0, 5);
  await expect(toolbar(page).getByRole('button', { name: 'Bold', exact: true })).toBeEnabled();
  await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Note actions' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Search document' }).focus();
  await expect(toolbar(page)).toBeHidden();
  await homeZoomBreadcrumb(page).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(toolbar(page)).toHaveCount(0);
});

test('runs movement, indentation and checked-state actions on the caret note and retains editor focus', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note2', 2);
  await toolbar(page).getByRole('button', { name: 'Move down', exact: true }).click();
  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note3', text: 'note3' },
    { noteId: 'note2', text: 'note2' },
  ]);
  await expect(input(page)).toBeFocused();
  await toolbar(page).getByRole('button', { name: 'Indent', exact: true }).click();
  await toolbar(page).getByRole('button', { name: 'Toggle checked', exact: true }).click();
  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note3', text: 'note3', children: [{ noteId: 'note2', text: 'note2', checked: true }] },
  ]);
  await toolbar(page).getByRole('button', { name: 'Outdent', exact: true }).click();
  await toolbar(page).getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1' },
    { noteId: 'note2', text: 'note2', checked: true },
    { noteId: 'note3', text: 'note3' },
  ]);
  await expect(input(page)).toBeFocused();
});

test('acts on the complete selected note range across repeated pointer operations', async ({ page, editor }) => {
  await editor.load('flat');
  await setCaretAtText(page, 'note2', 2);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(input(page)).toHaveClass(/editor-input--structural/u);
  await toolbar(page).getByRole('button', { name: 'Indent', exact: true }).click();
  await toolbar(page).getByRole('button', { name: 'Toggle checked', exact: true }).click();
  await expect(editor).toMatchOutline([
    { noteId: 'note1', text: 'note1', children: [
      { noteId: 'note2', text: 'note2', checked: true },
      { noteId: 'note3', text: 'note3', checked: true },
    ] },
  ]);
  await expect(input(page)).toHaveClass(/editor-input--structural/u);
  await toolbar(page).getByRole('button', { name: 'Outdent', exact: true }).click();
  await toolbar(page).getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(editor).toMatchOutline([
    { noteId: 'note2', text: 'note2', checked: true },
    { noteId: 'note3', text: 'note3', checked: true },
    { noteId: 'note1', text: 'note1' },
  ]);
  await expect(input(page)).toBeFocused();
});

test('uses document undo and redo and reflects their availability', async ({ page, editor }) => {
  await editor.load('flat');
  await selectInlineRange(page, 'note1', 0, 5);
  await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(noteRow(page, 'note1').locator('.text-bold')).toHaveText('note1');
  const undo = toolbar(page).getByRole('button', { name: 'Undo', exact: true });
  const redo = toolbar(page).getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(noteRow(page, 'note1').locator('.text-bold')).toHaveCount(0);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(noteRow(page, 'note1').locator('.text-bold')).toHaveText('note1');
  await expect(redo).toBeDisabled();
  await expect(input(page)).toBeFocused();
});

test('supports keyboard navigation and formatting activation without losing the selected text', async ({ page, editor }) => {
  await editor.load('flat');
  await selectInlineRange(page, 'note1', 0, 5);
  const bold = toolbar(page).getByRole('button', { name: 'Bold', exact: true });
  const italic = toolbar(page).getByRole('button', { name: 'Italic', exact: true });
  await expect(bold).toBeEnabled();
  await bold.focus();
  await page.keyboard.press('ArrowRight');
  await expect(italic).toBeFocused();
  await page.keyboard.press('Space');
  await expect(noteRow(page, 'note1').locator('.text-italic')).toHaveText('note1');
  await expect(input(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.getSelection()!.toString())).toBe('note1');
});

test('keeps every control reachable at a narrow desktop width without overflowing the page', async ({ page, editor }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await editor.load('flat');
  await selectInlineRange(page, 'note1', 0, 5);
  await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await setCaretAtText(page, 'note2', 2);
  await toolbar(page).getByRole('button', { name: 'Outdent', exact: true }).focus();
  await page.keyboard.press('End');
  const checked = toolbar(page).getByRole('button', { name: 'Toggle checked', exact: true });
  await expect(checked).toBeFocused();
  await expect.poll(() => toolbar(page).evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.keyboard.press('Home');
  await expect(toolbar(page).getByRole('button', { name: 'Undo', exact: true })).toBeFocused();
  await expect.poll(() => toolbar(page).evaluate(element => element.scrollLeft)).toBe(0);
});

test('preserves the zoom-root structural boundary and disables all controls in read-only editing', async ({ page, editor }) => {
  await editor.load('tree-complex');
  await page.goto(createEditorDocumentPath(editor.docId, 'note2'));
  await waitForSynced(page);
  await setCaretAtText(page, 'note2', 2);
  const before = await editor.getEditorState();
  for (const name of ['Indent', 'Outdent', 'Move up', 'Move down', 'Toggle checked']) {
    await toolbar(page).getByRole('button', { name, exact: true }).click();
    expect(await editor.getEditorState()).toEqual(before);
    await expect(input(page)).toBeFocused();
  }
  await page.evaluate(() => globalThis.__remdoTestBridges!.list()[0]!.editor.setEditable(false));
  await expect(toolbar(page)).toBeVisible();
  for (const button of await toolbar(page).getByRole('button').all()) await expect(button).toBeDisabled();
});
