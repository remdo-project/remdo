import { expect, isolatedTest as test } from '#editor/fixtures';
import { editorLocator, homeView } from '#editor/locators';
import { waitForSynced } from './_support/bridge';
import { createEditorDocumentPath } from './_support/routes';

test.describe('Document-root header', () => {
  test('shares the menu target with the note strip so one button shows at a time', async ({ page, editor }) => {
    await editor.load('tree-complex');
    const headerButton = page.getByRole('button', { name: /^Actions for/u });
    const noteButton = editorLocator(page).locator('.note-controls__button--menu');

    await page.getByRole('heading', { level: 1 }).hover();
    await expect(headerButton).toHaveCSS('opacity', '1');
    await expect(noteButton).toBeHidden();

    await editorLocator(page).locator('[data-lexical-text="true"]', { hasText: 'note2' }).first().hover();
    await expect(noteButton).toBeVisible();
    await expect(headerButton).toHaveCSS('opacity', '0');
  });

  test('renames the document from its menu and restores focus to the button', async ({ page, editor }) => {
    await editor.load('basic');
    const heading = page.getByRole('heading', { level: 1 });
    const initialName = await heading.innerText();
    const trigger = page.getByRole('button', { name: `Actions for ${initialName}` });

    await heading.hover();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await page.getByRole('textbox', { name: 'Document name' }).fill('Renamed header');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(heading).toHaveText('Renamed header');
    await expect(page.getByRole('button', { name: 'Actions for Renamed header' })).toBeFocused();
  });

  test('Zoom out from the header menu opens Home', async ({ page, editor }) => {
    await editor.load('tree-complex');

    await page.getByRole('heading', { level: 1 }).hover();
    await page.getByRole('button', { name: /^Actions for/u }).click();
    await page.getByRole('menuitem', { name: 'Zoom out' }).click();

    await expect(page).toHaveURL('/');
    await expect(homeView(page).getByRole('heading', { name: 'Home', level: 1 })).toBeFocused();
  });

  test('keeps the note strip available when history navigation zooms past the header', async ({ page, editor }) => {
    await editor.load('tree-complex');
    await page.getByRole('heading', { level: 1 }).hover();

    await page.evaluate((path) => {
      globalThis.history.pushState({}, '', path);
      globalThis.dispatchEvent(new PopStateEvent('popstate'));
    }, createEditorDocumentPath(editor.docId, 'note2'));
    await expect(page).toHaveURL(/note2$/u);
    await waitForSynced(page);
    await page.mouse.move(0, 0);

    await expect(editorLocator(page).locator('.note-controls__button--menu')).toBeVisible();
  });

  test('folds the document to a level from the menu accelerator', async ({ page, editor }) => {
    await editor.load('tree-complex');

    await page.getByRole('heading', { level: 1 }).hover();
    await page.getByRole('button', { name: /^Actions for/u }).click();
    await page.keyboard.press('1');

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(editor).toMatchOutline([
      {
        noteId: 'note1',
        text: 'note1',
        folded: true,
        children: [
          {
            noteId: 'note2',
            text: 'note2',
            children: [{ noteId: 'note3', text: 'note3' }],
          },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      {
        noteId: 'note6',
        text: 'note6',
        folded: true,
        children: [{ noteId: 'note7', text: 'note7' }],
      },
    ]);
  });
});
